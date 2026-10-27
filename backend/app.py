"""Team Task Sheet - Flask backend.  Run:  pip install -r requirements.txt && python app.py"""
import os, sqlite3, datetime as dt
from flask import Flask, request, jsonify, session, render_template, abort

BASE = os.path.dirname(os.path.abspath(__file__))
FRONT = os.path.join(BASE, "..", "frontend")
app = Flask(__name__, template_folder=os.path.join(FRONT, "html"), static_folder=FRONT, static_url_path="/static")
app.secret_key = os.environ.get("SECRET_KEY", "change-this-secret")
DB = os.path.join(BASE, "tasks.db")

USERS = ["Dheeraj", "Vyshak", "Nahan", "Bana", "Shanto"]   # no PINs - just pick your name
MEMBERS = ["Dheeraj", "Vyshak", "Nahan"]
# Bana & Shanto never appear on the public sign-in page. They use a private link:
#   http://<server>:5000/leadership/<ADMIN_KEY>      (set your own ADMIN_KEY env var!)
ADMIN_KEY = os.environ.get("ADMIN_KEY", "bana-private-link")
SHEETS = MEMBERS + ["Bana"]
ADMIN = "Bana"      # sees + edits every sheet
VIEWER = "Shanto"   # view-only access to every sheet
DEPTS = ["Marketing", "Operation", "HR", "R&D", "Project Department"]
REQ_FROM = ["Farzan", "Shibil", "Shanto", "Dildar", "Ajmal", "Sinan"]


def db():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c


with db() as c:
    c.execute("""CREATE TABLE IF NOT EXISTS tasks(
        id INTEGER PRIMARY KEY AUTOINCREMENT, person TEXT, date TEXT, task TEXT,
        department TEXT, req_from TEXT, status TEXT, completed_date TEXT)""")
    c.execute("UPDATE tasks SET req_from = TRIM(REPLACE(req_from, ' Sir', ''))")  # one-time cleanup of old names


def today():
    return dt.date.today().isoformat()


def user():
    return session.get("user")


def target(p, write=False):
    """Which sheet this user may touch (None = not allowed)."""
    u = user()
    if not u:
        return None
    if u == ADMIN:
        return p if p in SHEETS else u
    if u == VIEWER:
        return None if write else (p if p in SHEETS else MEMBERS[0])
    return u


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/leadership/<key>")
def leadership(key):
    if key != ADMIN_KEY:
        abort(404)
    return render_template("index.html")


@app.post("/api/login")
def login():
    d = request.get_json(force=True)
    name = d.get("name")
    if name in MEMBERS or (name in (ADMIN, VIEWER) and d.get("key") == ADMIN_KEY):
        session["user"] = name
        return jsonify(ok=True)
    return jsonify(error="Sign in not allowed"), 401


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/me")
def me():
    u = user()
    if not u:
        return jsonify(error="Not logged in"), 401
    role = "admin" if u == ADMIN else "viewer" if u == VIEWER else "member"
    return jsonify(user=u, role=role, canEdit=role != "viewer",
                   people=SHEETS if u in (ADMIN, VIEWER) else [u],
                   departments=DEPTS, reqFrom=REQ_FROM, today=today())


@app.get("/api/tasks")
def tasks():
    p = target(request.args.get("person"))
    if not p:
        return jsonify(error="Not logged in"), 401
    rows = db().execute("SELECT * FROM tasks WHERE person=? ORDER BY date DESC, id DESC", (p,)).fetchall()
    return jsonify(tasks=[dict(r) for r in rows])


@app.get("/api/today")
def today_tasks():
    u = user()
    if not u:
        return jsonify(error="Not logged in"), 401
    people = SHEETS if u in (ADMIN, VIEWER) else [u]
    q = ("SELECT * FROM tasks WHERE (date=? OR status='Pending') "
         "AND person IN (%s) ORDER BY person, date DESC, id DESC") % ",".join("?" * len(people))
    connection = db()
    try:
        rows = connection.execute(q, [today()] + people).fetchall()
    finally:
        connection.close()
    return jsonify(tasks=[dict(r) for r in rows])


@app.post("/api/tasks")
def save():
    d = request.get_json(force=True)
    p = target(d.get("person"), True)
    if not p:
        return jsonify(error="Not allowed"), 403
    if not (d.get("task") or "").strip():
        return jsonify(error="Task is required"), 400
    status = "Completed" if d.get("status") == "Completed" else "Pending"
    done = (d.get("completed_date") or today()) if status == "Completed" else ""  # auto date
    vals = (d.get("date") or today(), d["task"].strip(), d.get("department", ""), d.get("req_from", ""), status, done)
    with db() as c:
        if d.get("id"):
            c.execute("UPDATE tasks SET date=?,task=?,department=?,req_from=?,status=?,completed_date=? "
                      "WHERE id=? AND person=?", vals + (d["id"], p))
        else:
            c.execute("INSERT INTO tasks(date,task,department,req_from,status,completed_date,person) "
                      "VALUES(?,?,?,?,?,?,?)", vals + (p,))
    return jsonify(ok=True)


@app.get("/api/summary")
def summary():
    if user() not in (ADMIN, VIEWER):
        return jsonify(error="Not allowed"), 403
    q = "SELECT person, department, req_from, status FROM tasks WHERE person IN (%s)" % ",".join("?" * len(SHEETS))
    return jsonify(rows=[dict(r) for r in db().execute(q, SHEETS).fetchall()])


@app.delete("/api/tasks/<int:tid>")
def delete(tid):
    p = target(request.args.get("person"), True)
    if not p:
        return jsonify(error="Not allowed"), 403
    with db() as c:
        c.execute("DELETE FROM tasks WHERE id=? AND person=?", (tid, p))
    return jsonify(ok=True)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
