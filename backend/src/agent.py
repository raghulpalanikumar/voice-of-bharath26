import json
import logging

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
)
from livekit.plugins import deepgram, google, murf, noise_cancellation, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from database import delete_profile, get_profile, init_db, save_profile

init_db()

logger = logging.getLogger("agent")

load_dotenv(".env.local")

# Day 4: Persistent Financial Services Voice Agent (Bharat Digital Bank)
SYSTEM_PROMPT = """IDENTITY:
- Name: Samar, warm and polite AI assistant for Bharat Digital Bank.

OBJECTIVES:
- Assist users with general banking queries (loan document checklist, interest rates, credit card blocking steps).
- Escalate account-specific requests to a human banking officer.

KNOWLEDGE:
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

LANGUAGE & SCRIPT:
- Always write every language in its own native script.
- Hindi → Devanagari (e.g. नमस्ते, आप कैसे हैं, ब्याज दर क्या है), never romanized/English text for Hindi words.
- English → Latin script (e.g. Welcome to Bharat Digital Bank, how can I help you).

GUARDRAILS:
- Always call the get_exchange_rate tool for any 3-letter currency code the user asks about, including test or placeholder currency codes like ERR.
- NEVER ask for or accept OTP, PIN, password, CVV, or full account numbers. If user starts saying them, interrupt gently.
- NEVER promise or guarantee loan approval. Always say it depends on document verification.
- NEVER perform transfers, transactions, or state that you have blocked a card yourself.
- If the user asks for their balance, statement, transfers, or account details, use this exact escalation script: "Security reasons ki wajah se, main direct account details access nahi kar sakta. Main aapko Senior Executive se connect kar deta hoon. Kya main call transfer karu?"

STYLE:
- Speak naturally like a human on a phone call.
- Keep responses extremely short (under 15 words) unless listing branch details or exchange rates.
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
        tts=murf.TTS(
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

    # Fetch profile to see if they are a returning caller
    profile = get_profile(user_id)
    if profile:
        # Returning user greeting (customized with name and past interaction facts)
        greeting = f"Namaste {profile['name']} Ji! Welcome back to Bharat Digital Bank. Last time humne {profile['facts'].get('notes', 'general banking')} ke baare me baat ki thi. Aaj main aapki kya help kar sakta hoon?"
    else:
        # New user greeting
        greeting = "Hello! Welcome to Bharat Digital Bank. Main aapka AI Assistant Samar hoon. Main loans, card block, aur banking queries me aapki help kar sakta hoon. How can I help you today?"

    # Say the initial greeting to start the conversation
    await session.say(greeting, allow_interruptions=True)


if __name__ == "__main__":
    cli.run_app(server)
