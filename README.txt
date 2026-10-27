TEAM TASK SHEET

  backend/            Python (Flask)  -> app.py, requirements.txt
  frontend/html/      index.html
  frontend/css/       style.css
  frontend/js/        app.js

Run:
  cd backend
  pip install -r requirements.txt
  python app.py          -> open http://localhost:5000

No PINs. Dheeraj/Vyshak/Nahan sign in on the normal page. Bana & Shanto sign in ONLY at the private link /leadership/<ADMIN_KEY> (default key: bana-private-link; set env ADMIN_KEY). Bana = admin (view + edit all). Shanto = viewer (view all, edit nothing). Dheeraj, Vyshak, Nahan = own sheet only.
