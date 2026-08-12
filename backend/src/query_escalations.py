import sys
import os
import sqlite3
import json

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "database.db")

def get_db_connection():
    return sqlite3.connect(DB_PATH)

def list_escalations():
    conn = get_db_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM escalations ORDER BY id DESC")
        rows = cursor.fetchall()
        escalations = []
        for r in rows:
            escalations.append({
                "id": r["id"],
                "user_id": r["user_id"],
                "name": r["name"],
                "language_preference": r["language_preference"],
                "what_happened": r["what_happened"],
                "what_agent_checked": r["what_agent_checked"],
                "urgency": r["urgency"],
                "follow_up_method": r["follow_up_method"],
                "status": r["status"],
                "created_at": r["created_at"]
            })
        print(json.dumps(escalations))
    except sqlite3.OperationalError:
        # Table might not exist yet if database hasn't initialized
        print(json.dumps([]))
    finally:
        conn.close()

def update_status(esc_id, status):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE escalations SET status = ? WHERE id = ?", (status, esc_id))
        conn.commit()
        print(json.dumps({"success": True}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
    finally:
        conn.close()

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No action specified"}))
        sys.exit(1)
        
    action = sys.argv[1]
    if action == "list":
        list_escalations()
    elif action == "update":
        if len(sys.argv) < 4:
            print(json.dumps({"error": "Missing ID or status"}))
            sys.exit(1)
        esc_id = int(sys.argv[2])
        status = sys.argv[3]
        update_status(esc_id, status)
    else:
        print(json.dumps({"error": "Unknown action"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
