import datetime
import json
import logging
import os
import sqlite3

logger = logging.getLogger("database")

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "database.db")


def init_db():
    logger.info(f"Initializing database at {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id TEXT PRIMARY KEY,
            name TEXT,
            language_preference TEXT,
            facts TEXT,
            last_interaction TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS escalations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            name TEXT,
            language_preference TEXT,
            what_happened TEXT,
            what_agent_checked TEXT,
            urgency TEXT,
            follow_up_method TEXT,
            status TEXT DEFAULT 'open',
            created_at TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS calls (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            channel TEXT,
            status TEXT DEFAULT 'failed',
            failure_reason TEXT DEFAULT 'user_hangup',
            duration INTEGER DEFAULT 0,
            created_at TEXT
        )
    """)
    conn.commit()
    conn.close()


def insert_call(call_id: str, user_id: str, channel: str):
    logger.info(f"Inserting new call record: {call_id} for user {user_id} via {channel}")
    created_at = datetime.datetime.now().isoformat()
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO calls (id, user_id, channel, status, failure_reason, duration, created_at)
            VALUES (?, ?, ?, 'failed', 'user_hangup', 0, ?)
            """,
            (call_id, user_id, channel, created_at),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error inserting call record: {e}")


def update_call_outcome(call_id: str, status: str, failure_reason: str | None, duration: int):
    logger.info(f"Updating call {call_id} outcome to status={status}, reason={failure_reason}, duration={duration}")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE calls
            SET status = ?, failure_reason = ?, duration = ?
            WHERE id = ?
            """,
            (status, failure_reason, duration, call_id),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error updating call outcome: {e}")



def get_profile(user_id: str):
    logger.info(f"Retrieving profile for {user_id}")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name, language_preference, facts, last_interaction FROM user_profiles WHERE user_id = ?",
            (user_id,),
        )
        row = cursor.fetchone()
        conn.close()
        if row:
            return {
                "name": row[0],
                "language_preference": row[1],
                "facts": json.loads(row[2]) if row[2] else {},
                "last_interaction": row[3],
            }
    except Exception as e:
        logger.error(f"Error reading profile: {e}")
    return None


def save_profile(
    user_id: str,
    name: str,
    language_preference: str,
    facts: dict,
    last_interaction: str | None = None,
):
    logger.info(f"Saving profile for {user_id}")
    if last_interaction is None:
        last_interaction = datetime.datetime.now().isoformat()
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO user_profiles (user_id, name, language_preference, facts, last_interaction)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                name=excluded.name,
                language_preference=excluded.language_preference,
                facts=excluded.facts,
                last_interaction=excluded.last_interaction
        """,
            (user_id, name, language_preference, json.dumps(facts), last_interaction),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error saving profile: {e}")


def delete_profile(user_id: str):
    logger.info(f"Deleting profile for {user_id}")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM user_profiles WHERE user_id = ?", (user_id,))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error deleting profile: {e}")


def create_escalation_request(
    user_id: str,
    what_happened: str,
    what_agent_checked: str,
    urgency: str,
    follow_up_method: str,
) -> str:
    logger.info(f"Creating escalation request for user {user_id}")
    # Get profile name and language if they exist
    profile = get_profile(user_id)
    name = profile.get("name") if profile else "Unknown"
    lang = profile.get("language_preference") if profile else "en-IN"

    import datetime
    created_at = datetime.datetime.now().isoformat()

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO escalations (
                user_id, name, language_preference, what_happened,
                what_agent_checked, urgency, follow_up_method, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
            """,
            (
                user_id,
                name,
                lang,
                what_happened,
                what_agent_checked,
                urgency,
                follow_up_method,
                created_at,
            ),
        )
        escalation_id = cursor.lastrowid
        conn.commit()
        conn.close()
        ref_id = f"BDB-ESC-{escalation_id}"
        logger.info(f"Escalation created successfully with Ref ID: {ref_id}")
        return ref_id
    except Exception as e:
        logger.error(f"Error creating escalation: {e}")
        return "BDB-ESC-ERROR"

