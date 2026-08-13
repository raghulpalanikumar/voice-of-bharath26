import sys
import os
import sqlite3
import json

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "database.db")

def get_db_connection():
    return sqlite3.connect(DB_PATH)

def list_calls():
    conn = get_db_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM calls ORDER BY created_at DESC LIMIT 50")
        rows = cursor.fetchall()
        calls = []
        for r in rows:
            calls.append({
                "id": r["id"],
                "user_id": r["user_id"],
                "channel": r["channel"],
                "status": r["status"],
                "failure_reason": r["failure_reason"],
                "duration": r["duration"],
                "created_at": r["created_at"]
            })
        print(json.dumps(calls))
    except sqlite3.OperationalError:
        print(json.dumps([]))
    finally:
        conn.close()

def get_stats():
    conn = get_db_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) as count FROM calls")
        total = cursor.fetchone()["count"] or 0
        
        cursor.execute("SELECT COUNT(*) as count FROM calls WHERE status = 'success'")
        successful = cursor.fetchone()["count"] or 0
        
        cursor.execute("SELECT COUNT(*) as count FROM calls WHERE status = 'failed'")
        failed = cursor.fetchone()["count"] or 0
        
        cursor.execute("SELECT failure_reason, COUNT(*) as count FROM calls WHERE status = 'failed' GROUP BY failure_reason")
        reasons_rows = cursor.fetchall()
        failure_reasons = {}
        for r in reasons_rows:
            failure_reasons[r["failure_reason"] or "unknown"] = r["count"]
            
        success_rate = round((successful / total * 100), 1) if total > 0 else 0.0
        
        stats = {
            "total_calls": total,
            "successful_calls": successful,
            "failed_calls": failed,
            "success_rate": success_rate,
            "failure_reasons": failure_reasons
        }
        print(json.dumps(stats))
    except sqlite3.OperationalError:
        print(json.dumps({
            "total_calls": 0,
            "successful_calls": 0,
            "failed_calls": 0,
            "success_rate": 0.0,
            "failure_reasons": {}
        }))
    finally:
        conn.close()

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No action specified"}))
        sys.exit(1)
        
    action = sys.argv[1]
    if action == "list":
        list_calls()
    elif action == "stats":
        get_stats()
    else:
        print(json.dumps({"error": "Unknown action"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
