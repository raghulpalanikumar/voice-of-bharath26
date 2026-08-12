import pytest
import sqlite3
import os
from database import init_db, create_escalation_request

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "database.db")

def test_database_escalation_storage():
    """Verify that create_escalation_request properly stores a ticket in SQLite and returns the correct reference ID format."""
    init_db()
    
    # Create request
    ref_id = create_escalation_request(
        user_id="test_user_123",
        what_happened="Potential fraud: unauthorized charges on my credit card",
        what_agent_checked="Checked credit card block guide",
        urgency="high",
        follow_up_method="phone call"
    )
    
    assert ref_id.startswith("BDB-ESC-")
    
    # Query database directly to verify
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM escalations WHERE user_id = ? ORDER BY id DESC LIMIT 1", ("test_user_123",))
    row = cursor.fetchone()
    conn.close()
    
    assert row is not None
    assert row["what_happened"] == "Potential fraud: unauthorized charges on my credit card"
    assert row["urgency"] == "high"
    assert row["follow_up_method"] == "phone call"
    assert row["status"] == "open"
