import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE = os.path.join(BASE_DIR, "smartpark.db")


def get_db_connection():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    connection = get_db_connection()

    # Parking slots table
    connection.execute("""
        CREATE TABLE IF NOT EXISTS parking_slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slot_number TEXT UNIQUE NOT NULL,
            status TEXT NOT NULL DEFAULT 'Available'
        )
    """)

    # Bookings table
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
            FOREIGN KEY (slot_id) REFERENCES parking_slots(id)
        )
    """)

    # Create 20 parking slots
    for number in range(1, 21):
        slot = f"P{number:02d}"

        connection.execute("""
            INSERT OR IGNORE INTO parking_slots (slot_number, status)
            VALUES (?, 'Available')
        """, (slot,))

    connection.commit()
    connection.close()


if __name__ == "__main__":
    initialize_database()
    print("SmartPark database and booking table initialized!")