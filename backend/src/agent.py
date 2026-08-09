import logging

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    cli,
    inference,
    tokenize,
    room_io,
    function_tool,
    RunContext,
)
import os
from livekit.plugins import murf, silero, google, deepgram, noise_cancellation, openai
from livekit.plugins.turn_detector.multilingual import MultilingualModel
from database import init_db, get_profile, save_profile, delete_profile

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
- You MUST ask for the user's explicit consent before saving any facts or profile information (e.g., "Kya main aapki details save kar sakta hoon?").
- Only call `save_user_profile` if they give explicit consent.

LANGUAGE & SCRIPT:
- Always write every language in its own native script.
- Hindi → Devanagari (e.g. नमस्ते, आप कैसे हैं, ब्याज दर क्या है), never romanized/English text for Hindi words.
- English → Latin script (e.g. Welcome to Bharat Digital Bank, how can I help you).

GUARDRAILS:
- NEVER ask for or accept OTP, PIN, password, CVV, or full account numbers. If user starts saying them, interrupt gently.
- NEVER promise or guarantee loan approval. Always say it depends on document verification.
- NEVER perform transfers, transactions, or state that you have blocked a card yourself.
- If the user asks for their balance, statement, transfers, or account details, use this exact escalation script: "Security reasons ki wajah se, main direct account details access nahi kar sakta. Main aapko Senior Executive se connect kar deta hoon. Kya main call transfer karu?"

STYLE:
- Speak naturally like a human on a phone call.
- Keep responses extremely short (under 15 words).
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
    async def save_user_profile(self, name: str, language_preference: str, facts: str, user_consent: bool) -> str:
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
        logger.info(f"Saved profile for {self.user_id}: name={name}, lang={language_preference}, facts={facts_dict}")
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
                text_pacing=True
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
