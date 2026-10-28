"""One-time copy of tasks.db (SQLite) into Neon Postgres.
Run once:  python migrate.py   (needs DATABASE_URL set and tasks.db next to this file)
"""
import os, sqlite3, psycopg2

src = sqlite3.connect(os.path.join(os.path.dirname(os.path.abspath(__file__)), "tasks.db"))
src.row_factory = sqlite3.Row
rows = src.execute("SELECT * FROM tasks ORDER BY id").fetchall()

conn = psycopg2.connect(os.environ["DATABASE_URL"])
with conn, conn.cursor() as cur:
    cur.execute("""CREATE TABLE IF NOT EXISTS tasks(
        id SERIAL PRIMARY KEY, person TEXT, date TEXT, task TEXT,
        department TEXT, req_from TEXT, status TEXT, completed_date TEXT)""")
    for r in rows:
        cur.execute("""INSERT INTO tasks(id,person,date,task,department,req_from,status,completed_date)
                       VALUES(%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING""",
                    (r["id"], r["person"], r["date"], r["task"], r["department"],
                     r["req_from"], r["status"], r["completed_date"]))
    # keep auto-increment ahead of the copied ids
    cur.execute("SELECT setval(pg_get_serial_sequence('tasks','id'), COALESCE((SELECT MAX(id) FROM tasks),1))")
print(f"Migrated {len(rows)} tasks")
