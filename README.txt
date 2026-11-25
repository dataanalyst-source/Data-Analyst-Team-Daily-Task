TEAM TASK SHEET

  backend/            Python (Flask)  -> app.py, requirements.txt
  frontend/html/      index.html
  frontend/css/       style.css
  frontend/js/        app.js

Run:
  cd backend
  pip install -r requirements.txt
  python app.py          -> open http://localhost:5000

Requested From options are filtered by department and learned from saved tasks.
Manually entered requester names become dropdown options for that department after saving.
Dildar and Shanto are available for Operation by default; Branch Managers is excluded
from Operation and Dildar is excluded from HR. Existing requester names are normalized
to title case at startup; the literal value "none" stays lowercase.
The task sheet supports text search plus status, department, and requester filters.
Filtered results are used for CSV and PDF downloads.

The app loads DATABASE_URL, SECRET_KEY, and ADMIN_KEY from the project-root env file. You can also set them in the shell.

No PINs. Dheeraj/Vyshak/Nahan sign in on the normal page. Bana & Shanto sign in ONLY at the private link /leadership/<ADMIN_KEY> (default key: bana-private-link; set env ADMIN_KEY). Bana = admin (view + edit all). Shanto = viewer (view all, edit nothing). Dheeraj, Vyshak, Nahan = own sheet only.
