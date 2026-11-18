import sqlite3
import os
import secrets

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE = os.environ.get(
    "SMARTPARK_DATABASE_PATH",
    os.path.join(BASE_DIR, "smartpark.db")
)

os.makedirs(os.path.dirname(os.path.abspath(DATABASE)), exist_ok=True)


def get_db_connection():
    os.makedirs(os.path.dirname(os.path.abspath(DATABASE)), exist_ok=True)
    connection = sqlite3.connect(DATABASE, timeout=15)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 15000")
    return connection


def initialize_database():
    connection = get_db_connection()

    try:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS parking_slots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slot_number TEXT UNIQUE NOT NULL,
                status TEXT NOT NULL DEFAULT 'Available'
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slot_id INTEGER NOT NULL,
                customer_name TEXT NOT NULL,
                vehicle_number TEXT NOT NULL,
                booking_date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Confirmed',
                check_in_time TEXT,
                check_out_time TEXT,
                qr_token TEXT UNIQUE,
                FOREIGN KEY (slot_id) REFERENCES parking_slots(id)
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                description TEXT NOT NULL,
                booking_id INTEGER,
                created_at TEXT NOT NULL
            )
        """)

        columns = [
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(bookings)"
            ).fetchall()
        ]

        if "check_in_time" not in columns:
            connection.execute(
                "ALTER TABLE bookings ADD COLUMN check_in_time TEXT"
            )

        if "check_out_time" not in columns:
            connection.execute(
                "ALTER TABLE bookings ADD COLUMN check_out_time TEXT"
            )

        if "qr_token" not in columns:
            connection.execute(
                "ALTER TABLE bookings ADD COLUMN qr_token TEXT"
            )

        # Give existing bookings their own unique QR tokens.
        old_bookings = connection.execute("""
            SELECT id FROM bookings
            WHERE qr_token IS NULL OR qr_token = ''
        """).fetchall()

        for booking in old_bookings:
            token = secrets.token_urlsafe(32)
            connection.execute("""
                UPDATE bookings
                SET qr_token = ?
                WHERE id = ?
            """, (token, booking["id"]))

        for number in range(1, 21):
            slot = f"P{number:02d}"
            connection.execute("""
                INSERT OR IGNORE INTO parking_slots
                (slot_number, status)
                VALUES (?, 'Available')
            """, (slot,))

        connection.commit()

    finally:
        connection.close()


if __name__ == "__main__":
    initialize_database()
    print("SmartPark database initialized successfully!")