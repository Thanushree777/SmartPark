# SmartPark

Flask + SQLite smart parking prototype.

## Run locally (Windows / VS Code)

1. Open this project folder in VS Code.
2. Create a virtual environment if needed: `python -m venv .venv`
3. Activate it in PowerShell: `.venv\Scripts\Activate.ps1`
4. Install packages: `pip install -r requirements.txt`
5. Copy `.env.example` to `.env` and set a long random `SMARTPARK_SECRET_KEY`, your admin username, and a strong admin password. Never commit or share `.env`.
6. Start the app: `python backend/app.py`
7. Open `http://127.0.0.1:5002`.

## Phase 5 security changes

- Admin-only booking list, cancellation, QR verification, check-in/out, activity logs, overstay, and slot-management APIs.
- Customer QR image lookup now requires the unguessable QR token; booking IDs alone no longer reveal a QR pass.
- Booking creation validates JSON types, field lengths, vehicle format, date and time.
- Login rejects malformed credential types; successful login rotates the session.
- Session cookies use HttpOnly and SameSite=Lax. `SMARTPARK_COOKIE_SECURE=true` should be used only when the app is served over HTTPS.
- SQLite connections enable foreign keys and a busy timeout; database path can be configured with `SMARTPARK_DATABASE_PATH`.
- `.env`, local databases, virtual environments and caches are excluded from Git and Docker build context.

## Run tests

With the virtual environment active: `pytest -q`

## Run with Docker

1. Create `.env` as described above.
2. Run `docker compose up --build`.
3. Open `http://127.0.0.1:5002`.

Docker stores its database in a named volume. Local mode uses `smartpark.db` in the project root unless `SMARTPARK_DATABASE_PATH` is set.

## Important

The QR token is a bearer credential: treat the generated QR pass like a ticket and do not post it publicly. This prototype is intended for a college demonstration, not production deployment without HTTPS, operational monitoring, backup, and further security review.
