"""Team Task Sheet - Flask backend (Neon Postgres).
Run:  pip install -r requirements.txt && set DATABASE_URL && python app.py
"""
import os, datetime as dt, html
from io import BytesIO
from contextlib import closing

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from flask import Flask, request, jsonify, session, render_template, abort, send_file
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

BASE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE, "..", "env"))
FRONT = os.path.join(BASE, "..", "frontend")
app = Flask(__name__, template_folder=os.path.join(FRONT, "html"), static_folder=FRONT, static_url_path="/static")
app.secret_key = os.environ.get("SECRET_KEY", "change-this-secret")

# Neon connection string, e.g.
# postgresql://user:pass@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set. Add it to the project-root env file or set it in the shell.")

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


def run(sql, params=(), fetch=False):
    """Open a connection, run one statement, commit, close. Returns list of dicts if fetch=True."""
    with closing(psycopg2.connect(DATABASE_URL)) as conn:
        with conn:  # commits on success, rolls back on error
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, params)
                return [dict(r) for r in cur.fetchall()] if fetch else None


run("""CREATE TABLE IF NOT EXISTS tasks(
    id SERIAL PRIMARY KEY, person TEXT, date TEXT, task TEXT,
    department TEXT, req_from TEXT, status TEXT, completed_date TEXT)""")
run("UPDATE tasks SET req_from = TRIM(REPLACE(req_from, ' Sir', '')) "
    "WHERE POSITION(' Sir' IN req_from) > 0")  # cleanup of old names


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
    rows = run("SELECT * FROM tasks WHERE person=%s ORDER BY date DESC, id DESC", (p,), fetch=True)
    return jsonify(tasks=rows)


@app.get("/api/today")
def today_tasks():
    u = user()
    if not u:
        return jsonify(error="Not logged in"), 401
    people = SHEETS if u in (ADMIN, VIEWER) else [u]
    rows = run("SELECT * FROM tasks WHERE (date=%s OR status='Pending') "
               "AND person = ANY(%s) ORDER BY person, date DESC, id DESC",
               (today(), people), fetch=True)
    return jsonify(tasks=rows)


@app.get("/api/tasks/export.pdf")
def export_tasks_pdf():
    if user() != ADMIN:
        return jsonify(error="Not allowed"), 403

    person = request.args.get("person", "")
    status = request.args.get("status", "")
    search = request.args.get("search", "").strip().lower()
    if person != "__today" and person not in SHEETS:
        return jsonify(error="Invalid task sheet"), 400
    if status not in ("", "Pending", "Completed"):
        return jsonify(error="Invalid status"), 400

    if person == "__today":
        rows = run("SELECT * FROM tasks WHERE (date=%s OR status='Pending') "
                   "AND person = ANY(%s) ORDER BY person, date DESC, id DESC",
                   (today(), SHEETS), fetch=True)
    else:
        rows = run("SELECT * FROM tasks WHERE person=%s ORDER BY date DESC, id DESC",
                   (person,), fetch=True)

    def matches(row):
        return (not status or row["status"] == status) and (
            not search or search in ((row["task"] or "") + (row["department"] or "")
                                     + (row["req_from"] or "")
                                     + ((row["person"] or "") if person == "__today" else "")).lower()
        )

    rows = [row for row in rows if matches(row)]
    today_view = person == "__today"
    headers = (["Member"] if today_view else []) + [
        "Date", "Task", "Department", "Req from", "Status", "Completed"
    ]
    widths = ([65] if today_view else []) + [75, 220, 110, 110, 70, 95]
    month_names = ("Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

    def display_date(value):
        if not value:
            return "—"
        try:
            date = dt.date.fromisoformat(value)
            return f"{date.day:02d} {month_names[date.month - 1]} {date.year}"
        except ValueError:
            return value

    styles = getSampleStyleSheet()
    cell_style = ParagraphStyle("TaskCell", parent=styles["BodyText"], fontName="Helvetica",
                                fontSize=8, leading=10, textColor=colors.HexColor("#1c1a16"))
    title_style = ParagraphStyle("TaskTitle", parent=styles["Title"], fontName="Helvetica-Bold",
                                 fontSize=16, leading=20, textColor=colors.HexColor("#805c1e"))

    def cell(value):
        return Paragraph(html.escape(str(value or "—")).replace("\n", "<br/>"), cell_style)

    data = [headers]
    for row in rows:
        values = ([row["person"]] if today_view else []) + [
            display_date(row["date"]), row["task"], row["department"],
            row["req_from"], row["status"], display_date(row["completed_date"])
        ]
        data.append([cell(value) for value in values])

    output = BytesIO()
    document = SimpleDocTemplate(output, pagesize=landscape(A4), rightMargin=24,
                                 leftMargin=24, topMargin=24, bottomMargin=24)
    title = "Today's Tasks" if today_view else f"{person} Tasks"
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table_commands = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3ead8")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#6f5425")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d8d2c8")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]
    for index, row in enumerate(rows, start=1):
        background = "#e9f5ef" if row["status"] == "Completed" else "#fff6df"
        table_commands.append(("BACKGROUND", (0, index), (-1, index), colors.HexColor(background)))
    table.setStyle(TableStyle(table_commands))
    document.build([Paragraph(html.escape(title), title_style), Spacer(1, 12), table])
    output.seek(0)
    filename = f"tasks-{'today' if today_view else person.lower()}.pdf"
    return send_file(output, mimetype="application/pdf", as_attachment=True, download_name=filename)


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
    if d.get("id"):
        run("UPDATE tasks SET date=%s,task=%s,department=%s,req_from=%s,status=%s,completed_date=%s "
            "WHERE id=%s AND person=%s", vals + (d["id"], p))
    else:
        run("INSERT INTO tasks(date,task,department,req_from,status,completed_date,person) "
            "VALUES(%s,%s,%s,%s,%s,%s,%s)", vals + (p,))
    return jsonify(ok=True)


@app.get("/api/summary")
def summary():
    if user() not in (ADMIN, VIEWER):
        return jsonify(error="Not allowed"), 403
    rows = run("SELECT person, department, req_from, status FROM tasks WHERE person = ANY(%s)",
               (SHEETS,), fetch=True)
    return jsonify(rows=rows)


@app.delete("/api/tasks/<int:tid>")
def delete(tid):
    p = target(request.args.get("person"), True)
    if not p:
        return jsonify(error="Not allowed"), 403
    run("DELETE FROM tasks WHERE id=%s AND person=%s", (tid, p))
    return jsonify(ok=True)


if __name__ == "__main__":
    # For production use:  gunicorn app:app
    app.run(host="0.0.0.0", port=5000, debug=os.environ.get("FLASK_DEBUG") == "1")