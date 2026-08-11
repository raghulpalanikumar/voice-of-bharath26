import json
import logging
import asyncio
import base64
import time

import aiohttp
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    RunContext,
    cli,
    function_tool,
    room_io,
    tokenize,
    tts,
    utils,
    APIConnectionError,
    APIConnectOptions,
    APIStatusError,
    APITimeoutError,
)
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS
from livekit.plugins import deepgram, google, murf, noise_cancellation, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel
from livekit.plugins.murf.tts import (
    SynthesizeStream as MurfSynthesizeStream,
    _to_murf_websocket_pkt,
)

from database import delete_profile, get_profile, init_db, save_profile

init_db()

logger = logging.getLogger("agent")

load_dotenv(".env.local")


class DynamicLocaleSynthesizeStream(MurfSynthesizeStream):
    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        request_id = utils.shortuuid()
        output_emitter.initialize(
            request_id=request_id,
            sample_rate=self._opts.sample_rate,
            num_channels=1,
            mime_type="audio/pcm",
            stream=True,
        )

        input_sent_event = asyncio.Event()
        first_chunk_sent_time: float | None = None

        sent_tokenizer_stream = self._tts._sentence_tokenizer.stream()
        if self._tts._stream_pacer:
            sent_tokenizer_stream = self._tts._stream_pacer.wrap(
                sent_stream=sent_tokenizer_stream,
                audio_emitter=output_emitter,
            )

        async def _sentence_stream_task(ws: aiohttp.ClientWebSocketResponse) -> None:
            nonlocal first_chunk_sent_time
            context_id = utils.shortuuid()
            first_sent = True
            async for ev in sent_tokenizer_stream:
                # Detect language of this specific sentence
                has_devanagari = any("\u0900" <= char <= "\u097f" for char in ev.token)
                if has_devanagari:
                    self._opts.locale = "hi-IN"
                    logger.info(f"[DynamicLocale] Detected Devanagari, switching stream locale to hi-IN for sentence: '{ev.token}'")
                else:
                    self._opts.locale = "en-IN"
                    logger.info(f"[DynamicLocale] Detected English/Latin text, locking stream locale to en-IN for sentence: '{ev.token}'")

                # Generate the websocket packet using the updated options
                token_pkt = _to_murf_websocket_pkt(self._opts)
                token_pkt["context_id"] = context_id
                token_pkt["text"] = ev.token + " "
                self._mark_started()
                await ws.send_str(json.dumps(token_pkt))
                if first_sent:
                    first_sent = False
                    first_chunk_sent_time = time.perf_counter()
                    if self._tts._is_verbose():
                        logger.info(
                            "[Murf TTS] Stream started - context_id=%s, voice=%s, style=%s, locale=%s, "
                            "min_buffer_size=%d, max_buffer_delay_in_ms=%d, endpoint=%s",
                            context_id,
                            self._opts.voice,
                            self._opts.style,
                            self._opts.locale,
                            self._opts.min_buffer_size,
                            self._opts.max_buffer_delay_in_ms,
                            self._opts.base_url,
                        )
                input_sent_event.set()

            # End packet
            end_pkt = _to_murf_websocket_pkt(self._opts)
            end_pkt["context_id"] = context_id
            end_pkt["end"] = True
            await ws.send_str(json.dumps(end_pkt))
            input_sent_event.set()

        async def _input_task() -> None:
            async for data in self._input_ch:
                if isinstance(data, self._FlushSentinel):
                    sent_tokenizer_stream.flush()
                    continue

                sent_tokenizer_stream.push_text(data)

            sent_tokenizer_stream.end_input()

        async def _recv_task(ws: aiohttp.ClientWebSocketResponse) -> None:
            nonlocal first_chunk_sent_time
            current_segment_id: str | None = None
            first_audio_received = True
            await input_sent_event.wait()
            while True:
                msg = await ws.receive()
                if msg.type in (
                    aiohttp.WSMsgType.CLOSED,
                    aiohttp.WSMsgType.CLOSE,
                    aiohttp.WSMsgType.CLOSING,
                ):
                    logger.error("[Murf TTS] Connection closed unexpectedly")
                    raise APIStatusError(
                        "Murf AI connection closed unexpectedly", request_id=request_id
                    )

                if msg.type != aiohttp.WSMsgType.TEXT:
                    logger.warning("[Murf TTS] Unexpected message type %s", msg.type)
                    continue

                data = json.loads(msg.data)
                segment_id = data.get("context_id")
                if current_segment_id is None:
                    current_segment_id = segment_id
                    output_emitter.start_segment(segment_id=current_segment_id)
                if data.get("audio"):
                    if first_audio_received:
                        first_audio_received = False
                        if first_chunk_sent_time is not None:
                            ttfb_ms = (time.perf_counter() - first_chunk_sent_time) * 1000.0
                            if self._tts._is_verbose():
                                logger.info("[Murf TTS] Murf TTFB (first sentence to first audio): %.2f ms", ttfb_ms)
                    b64data = base64.b64decode(data["audio"])
                    output_emitter.push(b64data)
                elif data.get("final"):
                    if sent_tokenizer_stream.closed:
                        output_emitter.end_input()
                        break
                else:
                    logger.warning("[Murf TTS] Unexpected message %s", data)

        try:
            async with self._tts._pool.connection(timeout=self._conn_options.timeout) as ws:
                tasks = [
                    asyncio.create_task(_input_task()),
                    asyncio.create_task(_sentence_stream_task(ws)),
                    asyncio.create_task(_recv_task(ws)),
                ]

                try:
                    await asyncio.gather(*tasks)
                finally:
                    input_sent_event.set()
                    await sent_tokenizer_stream.aclose()
                    await utils.aio.gracefully_cancel(*tasks)
        except asyncio.TimeoutError:
            raise APITimeoutError() from None
        except aiohttp.ClientResponseError as e:
            logger.error("[Murf TTS] WebSocket error %d: %s", e.status, e.message)
            raise APIStatusError(
                message=e.message, status_code=e.status, request_id=None, body=None
            ) from None
        except Exception as e:
            logger.error("[Murf TTS] WebSocket connection failed: %s", str(e))
            raise APIConnectionError() from e


class DynamicLocaleTTS(murf.TTS):
    def stream(
        self, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> DynamicLocaleSynthesizeStream:
        stream = DynamicLocaleSynthesizeStream(tts=self, conn_options=conn_options)
        self._streams.add(stream)
        return stream

    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> tts.ChunkedStream:
        has_devanagari = any("\u0900" <= char <= "\u097f" for char in text)
        if has_devanagari:
            self._opts.locale = "hi-IN"
            logger.info(f"[DynamicLocale] Synthesize: Detected Devanagari, setting locale to hi-IN for text: '{text}'")
        else:
            self._opts.locale = "en-IN"
            logger.info(f"[DynamicLocale] Synthesize: Detected English/Latin, setting locale to en-IN for text: '{text}'")
        return super().synthesize(text, conn_options=conn_options)


# Day 6: Make Outbound Calls (Bharat Digital Bank)
SYSTEM_PROMPT = """IDENTITY:
- Name: Samar (समर in Hindi), warm and polite AI assistant for Bharat Digital Bank.

OBJECTIVES:
- Assist users with general banking queries (loan document checklist, interest rates, credit card blocking steps).
- For outbound calls: Notify the customer that they are eligible for the PM Digital Banking Scheme (PM-DBS) which offers a special 9.5 percent interest rate on Fixed Deposits, and that the registration deadline is approaching (on 15th August 2026). Check if they would like to lock in this rate or ask any questions.
- Escalate account-specific requests to a human banking officer.

KNOWLEDGE:
- PM Digital Banking Scheme (PM-DBS) Fixed Deposit interest rate: 9.5 percent per annum. Deadline: 15th August 2026. Only eligible customers (like the caller) can apply before the deadline.
- Home Loan interest rate: 8.5 percent per annum.
- Savings Account interest rate: 4 percent per annum.
- Credit Card blocking: Tell the user to use the Mobile App or call 1800-123-4567.
- Documents required for Home/Personal Loans: Aadhaar Card, PAN Card, Last 3 months salary slips, and 6 months bank statement.
- You do NOT have access to live account balances, PIN numbers, or transaction details.

PERSISTENT USER MEMORY:
- You have tools to retrieve, save, and forget user profiles.
- If a profile is found, welcome them back by name referencing past facts.
- If the user mentions their location or district (e.g. South Delhi, Bengaluru, Mumbai), ask for consent to save it to their profile. Once saved, you can automatically look up their nearest branch using the branch tool.
- You MUST ask for the user's explicit consent before saving any facts or profile information (e.g., "Kya main aapki details save kar sakta hoon?").
- Only call `save_user_profile` if they give explicit consent.

LANGUAGE & SCRIPT
Always write every language in its own native script.
Hindi → Devanagari (नमस्ते), never romanized (never "namaste"). Write proper nouns in Devanagari too (e.g. समर instead of Samar, भारत डिजिटल बैंक instead of Bharat Digital Bank) when writing in Hindi.
Same rule for all non-English languages.

GUARDRAILS:
- Always call the get_exchange_rate tool for any 3-letter currency code the user asks about, including test or placeholder currency codes like ERR.
- If the get_exchange_rate tool indicates the servers are offline or returns an error (like for ERR), you MUST explicitly state the fallback rate of 1 USD = 85.50 INR.
- NEVER ask for or accept OTP, PIN, password, CVV, or full account numbers. If user starts saying them, interrupt gently.
- NEVER promise or guarantee loan approval. Always say it depends on document verification.
- NEVER perform transfers, transactions, or state that you have blocked a card yourself.
- If the user asks for their balance, statement, transfers, or account details, use this exact escalation script: "Security reasons ki wajah se, main direct account details access nahi kar sakta. Main aapko Senior Executive se connect kar deta hoon. Kya main call transfer karu?"

STYLE:
- Speak naturally like a human on a phone call.
- Keep responses extremely short (under 15 words) unless listing branch details, exchange rates, or explaining scheme eligibility and deadlines.
- Do NOT use bullet points, lists, brackets, dashes, emojis, or symbols."""




class Assistant(Agent):
    def __init__(self, user_id: str) -> None:
        super().__init__(instructions=SYSTEM_PROMPT)
        self.user_id = user_id

    @function_tool
    async def get_user_profile(self) -> str:
        """
        Looks up the caller's profile in the database to see if they are a returning user.
        Always call this at the beginning of the conversation to know if the user is new or returning.
        """
        profile = get_profile(self.user_id)
        if profile:
            logger.info(f"Retrieved profile for {self.user_id}: {profile}")
            return f"Returning User Profile: Name is {profile['name']}, Language Preference is {profile['language_preference']}, Saved facts from past calls: {profile['facts']}"
        else:
            logger.info(f"No profile found for {self.user_id}")
            return "No returning user profile found. This is a new user call."

    @function_tool
    async def save_user_profile(
        self, name: str, language_preference: str, facts: str, user_consent: bool
    ) -> str:
        """
        Saves the user's name, preferred language, and key facts to the database.
        You MUST explicitly ask the user for consent (e.g. 'Can I save this info to remember you next time?') before calling this.
        Do NOT call this if user_consent is False.

        Args:
            name: The caller's name.
            language_preference: The caller's preferred language (e.g., English, Hindi, Hinglish).
            facts: Key details learned during the call (e.g., 'Checked Home Loan interest rate'). Do NOT store account or ID numbers.
            user_consent: True if the user gave explicit permission to save their info, False if they declined.
        """
        if not user_consent:
            return "Profile NOT saved because user did not give consent."

        # Save profile
        facts_dict = {"notes": facts}
        save_profile(self.user_id, name, language_preference, facts_dict)
        logger.info(
            f"Saved profile for {self.user_id}: name={name}, lang={language_preference}, facts={facts_dict}"
        )
        return "User profile saved successfully."

    @function_tool
    async def delete_user_profile(self) -> str:
        """
        Deletes the caller's profile and all saved facts from the database, forgetting them entirely.
        Call this when the user explicitly requests to be forgotten (e.g. 'delete my data' or 'forget me').
        """
        delete_profile(self.user_id)
        logger.info(f"Deleted profile for {self.user_id}")
        return "Your profile has been deleted and forgotten from the database."

    @function_tool
    async def get_exchange_rate(
        self, run_ctx: RunContext, currency: str, amount: float = 1.0
    ) -> str:
        """
        Fetches the real-time currency exchange rate for a foreign currency (like USD, EUR, GBP, AED, CAD)
        to Indian Rupee (INR) and computes the converted amount.
        Always tell the user the exact timestamp or date when this rate was last updated.

        Args:
            currency: The 3-letter currency code (e.g., 'USD', 'EUR', 'GBP', 'AED', 'CAD').
            amount: The amount of foreign currency to convert to INR (default is 1.0).
        """
        logger.info(f"Exchange rate lookup requested for {amount} {currency} to INR")
        curr_upper = currency.upper().strip()

        # Step 4: Handle failure path/simulate outage
        if curr_upper in ("FAIL", "ERR"):
            logger.info("Simulated API failure triggered by currency code 'FAIL'/'ERR'")
            return (
                "Error: Bharat Digital Bank currency servers are temporarily offline. "
                "However, our last recorded fallback rate is 1 USD = 85.50 INR. "
                "Please check our website or app later for live rates."
            )

        url = "https://open.er-api.com/v6/latest/INR"
        try:
            async with (
                aiohttp.ClientSession() as session,
                session.get(url, timeout=5) as response,
            ):
                if response.status != 200:
                    raise Exception(f"HTTP status {response.status}")
                data = await response.json()

                if data.get("result") != "success":
                    raise Exception("API result not success")

                rates = data.get("rates", {})
                if curr_upper not in rates:
                    return f"Error: Currency code '{currency}' is invalid or not supported by our API."

                # rates[curr_upper] is how many foreign units = 1 INR
                # e.g. 0.012 USD = 1 INR. So 1 USD = 1 / 0.012 INR.
                val = rates[curr_upper]
                if val == 0:
                    raise Exception("API returned rate as zero")
                rate_in_inr = 1.0 / val
                total_inr = amount * rate_in_inr
                last_update = data.get("time_last_update_utc", "unknown time")

                # Round for display/speech
                rate_rounded = round(rate_in_inr, 2)
                total_rounded = round(total_inr, 2)

                # Push UI update
                payload = {
                    "type": "exchange_rate",
                    "base": curr_upper,
                    "target": "INR",
                    "rate": rate_rounded,
                    "amount": amount,
                    "total": total_rounded,
                    "last_update": last_update,
                }
                try:
                    room_io = run_ctx.session.room_io
                    if room_io and room_io.room:
                        await room_io.room.local_participant.publish_data(
                            payload=json.dumps(payload), topic="exchange_rate"
                        )
                        logger.info(f"Published exchange rate data to room: {payload}")
                except ValueError:
                    # Expected in test environment without room connection
                    pass
                except Exception as pe:
                    logger.error(f"Failed to publish UI update: {pe}")

                return (
                    f"Exchange rate status: success. As of {last_update}, 1 {curr_upper} is equal to "
                    f"{rate_rounded} Indian Rupees. Therefore, {amount} {curr_upper} equals {total_rounded} INR."
                )
        except Exception as e:
            logger.error(f"API request failed: {e}")
            return (
                "Error: Unable to fetch real-time exchange rates due to a connection timeout. "
                "Our fallback rate is approximately 1 USD = 85.50 INR. "
                "Please verify via the mobile application."
            )

    @function_tool
    async def get_nearest_branches(
        self, run_ctx: RunContext, district: str | None = None
    ) -> str:
        """
        Looks up the nearest branch offices and ATMs of Bharat Digital Bank.
        If a district is not specified, it will look up the user's saved district or location from their profile database.

        Args:
            district: Optional district/city name (e.g. 'South Delhi', 'Bengaluru Urban', 'Mumbai Suburban').
        """
        logger.info(f"Branch lookup requested for district: {district}")

        # Local dataset of branches
        branches_database = {
            "south delhi": [
                {
                    "name": "Saket Main Branch",
                    "address": "M-34, Main Market, Saket, New Delhi",
                    "hours": "9 AM to 4 PM",
                    "phone": "011-4567890",
                },
                {
                    "name": "Vasant Kunj Branch",
                    "address": "Sector C, Vasant Kunj, New Delhi",
                    "hours": "9 AM to 4 PM",
                    "phone": "011-4567891",
                },
                {
                    "name": "Greater Kailash ATM",
                    "address": "M-Block Market, GK-1, New Delhi",
                    "hours": "24 Hours",
                    "phone": "N/A",
                },
            ],
            "bengaluru urban": [
                {
                    "name": "Indiranagar Branch",
                    "address": "456, 100 Feet Road, Indiranagar, Bengaluru",
                    "hours": "9 AM to 4 PM",
                    "phone": "080-4567890",
                },
                {
                    "name": "Koramangala Branch",
                    "address": "12, 80 Feet Road, Koramangala, Bengaluru",
                    "hours": "9 AM to 4 PM",
                    "phone": "080-4567891",
                },
                {
                    "name": "HSR Layout ATM",
                    "address": "Sector 6, HSR Layout, Bengaluru",
                    "hours": "24 Hours",
                    "phone": "N/A",
                },
            ],
            "mumbai suburban": [
                {
                    "name": "Andheri West Branch",
                    "address": "Veera Desai Road, Andheri West, Mumbai",
                    "hours": "9 AM to 4 PM",
                    "phone": "022-4567890",
                },
                {
                    "name": "Bandra West Branch",
                    "address": "Linking Road, Bandra West, Mumbai",
                    "hours": "9 AM to 4 PM",
                    "phone": "022-4567891",
                },
            ],
        }

        target_district = None
        chained_from_profile = False

        if district:
            target_district = district.lower().strip()
        else:
            # Step 1 Advanced: look up the user's district/location from profile database
            profile = get_profile(self.user_id)
            if profile and "facts" in profile:
                facts = profile["facts"]
                notes = facts.get("notes", "")
                for d in branches_database:
                    if d in notes.lower():
                        target_district = d
                        chained_from_profile = True
                        break

        if not target_district:
            return (
                "Error: No location or district specified. "
                "Please tell me which district or city you are currently in so I can find the nearest branch."
            )

        # Match nearest district
        matched_key = None
        for key in branches_database:
            if key in target_district or target_district in key:
                matched_key = key
                break

        if not matched_key:
            return (
                f"We currently do not have physical branches in '{target_district}'. "
                "Our existing branches are in South Delhi, Bengaluru Urban, and Mumbai Suburban. "
                "How else can I help you?"
            )

        branches_list = branches_database[matched_key]

        # Push UI update
        payload = {
            "type": "branches",
            "district": matched_key.title(),
            "branches": branches_list,
            "chained": chained_from_profile,
        }
        try:
            room_io = run_ctx.session.room_io
            if room_io and room_io.room:
                await room_io.room.local_participant.publish_data(
                    payload=json.dumps(payload), topic="branches"
                )
                logger.info(f"Published branch data to room: {payload}")
        except ValueError:
            # Expected in test environment without room connection
            pass
        except Exception as pe:
            logger.error(f"Failed to publish branches UI update: {pe}")

        # Format voice summary response (keep it brief for voice)
        branch_summaries = []
        for b in branches_list:
            branch_summaries.append(f"{b['name']} at {b['address']}")
        branches_str = " and ".join(branch_summaries[:2])

        chain_announcement = (
            " (using your saved profile location)" if chained_from_profile else ""
        )
        return (
            f"Found nearest locations in {matched_key.title()}{chain_announcement}: "
            f"We have {branches_str}."
        )


server = AgentServer()


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session(agent_name="my-agent")
async def my_agent(ctx: JobContext):
    # Join the room and connect to the user first to access room participants
    await ctx.connect()

    # Find the user's participant identity (default to a fallback if none found)
    user_id = "default_user"
    for p in ctx.room.remote_participants.values():
        user_id = p.identity
        break

    logger.info(f"User connected with ID: {user_id}")

    ctx.log_context_fields = {
        "room": ctx.room.name,
        "user_id": user_id,
    }

    # Set up a voice AI pipeline using Murf Falcon, Gemini, Deepgram, and the LiveKit turn detector
    session = AgentSession(
        # Speech-to-text (STT) supporting multi-language detection
        stt=deepgram.STT(model="nova-3", language="multi"),
        # A Large Language Model (LLM) is your agent's brain, processing user input and generating a response
        llm=google.LLM(
            model="gemini-3.5-flash-lite",
        ),
        # Text-to-speech (TTS) is your agent's voice
        tts=DynamicLocaleTTS(
            voice="Samar",
            locale="en-IN",
            style="Conversation",
            tokenizer=tokenize.basic.SentenceTokenizer(min_sentence_len=2),
            text_pacing=True,
        ),
        # VAD and turn detection
        turn_detection=MultilingualModel(),
        vad=ctx.proc.userdata["vad"],
        preemptive_generation=True,
    )

    # Start the session, which initializes the voice pipeline and warms up the models
    await session.start(
        agent=Assistant(user_id=user_id),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: (
                    noise_cancellation.BVCTelephony()
                    if params.participant.kind
                    == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                    else noise_cancellation.BVC()
                ),
            ),
        ),
    )

    is_outbound = ctx.room.name.startswith("outbound-")

    # Fetch profile to see if they are a returning caller
    profile = get_profile(user_id)
    if is_outbound:
        if profile:
            greeting = f"Namaste {profile['name']} Ji! Main Bharat Digital Bank se Samar bol raha hoon. Aapke account ke liye special PM Digital Banking Scheme ki deadline paas aa rahi hai. Aap is 9.5 percent interest rate scheme ke liye eligible hain. Kya main iski details share karu?"
        else:
            greeting = "Namaste! Main Bharat Digital Bank se Samar bol raha hoon. Aapke number par digital banking scheme eligibility hai, jiski deadline paas aa rahi hai. Kya main iski details share karu?"
    elif profile:
        # Returning user greeting (customized with name and past interaction facts)
        greeting = f"Namaste {profile['name']} Ji! Welcome back to Bharat Digital Bank. Last time humne {profile['facts'].get('notes', 'general banking')} ke baare me baat ki thi. Aaj main aapki kya help kar sakta hoon?"
    else:
        # New user greeting
        greeting = "Hello! Welcome to Bharat Digital Bank. Main aapka AI Assistant Samar hoon. Main loans, card block, aur banking queries me aapki help kar sakta hoon. How can I help you today?"

    # Say the initial greeting to start the conversation
    await session.say(greeting, allow_interruptions=True)


if __name__ == "__main__":
    cli.run_app(server)
