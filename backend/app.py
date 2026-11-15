from flask import Flask, jsonify, request, send_from_directory, session, redirect
from werkzeug.security import generate_password_hash, check_password_hash
import os
from functools import wraps
from datetime import datetime

from database import initialize_database, get_db_connection

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

app = Flask(__name__)
app.secret_key = os.environ.get(
    "SMARTPARK_SECRET_KEY",
    "smartpark-demo-secret-change-before-deployment"
)
ADMIN_USERNAME = os.environ.get("SMARTPARK_ADMIN_USERNAME", "admin")

ADMIN_PASSWORD_HASH = generate_password_hash(
    os.environ.get("SMARTPARK_ADMIN_PASSWORD", "SmartPark@123")
)
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("admin_logged_in"):
            return jsonify({"error": "Admin login required."}), 401

        return f(*args, **kwargs)

    return decorated_function

initialize_database()


@app.route("/")
def home():
    return send_from_directory(FRONTEND_DIR, "index.html")
@app.route("/admin-login")
def admin_login_page():
    return send_from_directory(FRONTEND_DIR, "admin-login.html")


@app.route("/admin")
def admin_dashboard():
    if not session.get("admin_logged_in"):
        return redirect("/admin-login")
    return send_from_directory(FRONTEND_DIR, "admin.html")


@app.route("/css/<path:filename>")
def css_files(filename):
    return send_from_directory(
        os.path.join(FRONTEND_DIR, "css"), filename
    )


@app.route("/js/<path:filename>")
def js_files(filename):
    return send_from_directory(
        os.path.join(FRONTEND_DIR, "js"), filename
    )


@app.route("/api/health")
def health():
    return jsonify({
        "status": "success",
        "message": "SmartPark backend is running!"
    })


# Get all parking slots
@app.route("/api/slots")
def get_slots():
    connection = get_db_connection()

    slots = connection.execute("""
        SELECT * FROM parking_slots ORDER BY id
    """).fetchall()

    connection.close()

    return jsonify([dict(slot) for slot in slots])


# Create a new parking booking
@app.route("/api/bookings", methods=["POST"])
def create_booking():

    data = request.get_json(silent=True) or {}

    customer_name = data.get("customer_name", "").strip()
    vehicle_number = data.get("vehicle_number", "").strip().upper()
    slot_number = data.get("slot_number", "").strip().upper()
    booking_date = data.get("booking_date", "")
    start_time = data.get("start_time", "")
    end_time = data.get("end_time", "")

    # Validate empty fields
    if not all([
        customer_name,
        vehicle_number,
        slot_number,
        booking_date,
        start_time,
        end_time
    ]):
        return jsonify({
            "error": "Please fill in all booking details."
        }), 400

    # Validate date and time
    try:
        date_value = datetime.strptime(booking_date, "%Y-%m-%d").date()
        start_value = datetime.strptime(start_time, "%H:%M").time()
        end_value = datetime.strptime(end_time, "%H:%M").time()
    except ValueError:
        return jsonify({
            "error": "Invalid date or time format."
        }), 400

    if date_value < datetime.now().date():
        return jsonify({
            "error": "Booking date cannot be in the past."
        }), 400

    if start_value >= end_value:
        return jsonify({
            "error": "End time must be later than start time."
        }), 400

    connection = get_db_connection()

    try:
        slot = connection.execute("""
            SELECT * FROM parking_slots
            WHERE slot_number = ?
        """, (slot_number,)).fetchone()

        if slot is None:
            return jsonify({
                "error": "Parking slot not found."
            }), 404

        # Check overlapping bookings for this slot
        existing_booking = connection.execute("""
            SELECT id FROM bookings
            WHERE slot_id = ?
            AND booking_date = ?
            AND status = 'Confirmed'
            AND start_time < ?
            AND end_time > ?
        """, (
            slot["id"],
            booking_date,
            end_time,
            start_time
        )).fetchone()

        if existing_booking:
            return jsonify({
                "error": "This slot is already booked during that time."
            }), 409

        cursor = connection.execute("""
            INSERT INTO bookings (
                slot_id,
                customer_name,
                vehicle_number,
                booking_date,
                start_time,
                end_time
            )
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            slot["id"],
            customer_name,
            vehicle_number,
            booking_date,
            start_time,
            end_time
        ))

        booking_id = cursor.lastrowid
        connection.commit()

        return jsonify({
            "message": "Parking booked successfully!",
            "booking_id": booking_id,
            "slot_number": slot_number
        }), 201

    finally:
        connection.close()
# Get all booking records
@app.route("/api/bookings", methods=["GET"])
def get_bookings():

    connection = get_db_connection()

    bookings = connection.execute("""
        SELECT
            bookings.id,
            bookings.customer_name,
            bookings.vehicle_number,
            parking_slots.slot_number,
            bookings.booking_date,
            bookings.start_time,
            bookings.end_time,
            bookings.status
        FROM bookings
        JOIN parking_slots
        ON bookings.slot_id = parking_slots.id
        ORDER BY bookings.id DESC
    """).fetchall()

    connection.close()

    return jsonify([dict(booking) for booking in bookings])


# Cancel an existing booking
@app.route("/api/bookings/<int:booking_id>", methods=["DELETE"])
def cancel_booking(booking_id):

    connection = get_db_connection()

    try:
        booking = connection.execute("""
            SELECT * FROM bookings WHERE id = ?
        """, (booking_id,)).fetchone()

        if booking is None:
            return jsonify({
                "error": "Booking not found."
            }), 404

        if booking["status"] == "Cancelled":
            return jsonify({
                "error": "This booking is already cancelled."
            }), 400

        connection.execute("""
            UPDATE bookings
            SET status = 'Cancelled'
            WHERE id = ?
        """, (booking_id,))

        connection.commit()

        return jsonify({
            "message": "Booking cancelled successfully!"
        })

    finally:
        connection.close()

# ADMIN: Add a new parking slot
@app.route("/api/admin/slots", methods=["POST"])
@admin_required
def add_admin_slot():
    data = request.get_json(silent=True) or {}
    slot_number = str(data.get("slot_number", "")).strip().upper()

    if not slot_number or len(slot_number) > 10:
        return jsonify({"error": "Enter a valid slot number."}), 400

    connection = get_db_connection()

    try:
        existing = connection.execute(
            "SELECT id FROM parking_slots WHERE slot_number = ?",
            (slot_number,)
        ).fetchone()

        if existing:
            return jsonify({"error": "This slot already exists."}), 409

        connection.execute(
            "INSERT INTO parking_slots (slot_number, status) VALUES (?, ?)",
            (slot_number, "Available")
        )

        connection.commit()

        return jsonify({
            "message": "Parking slot added successfully!",
            "slot_number": slot_number
        }), 201

    finally:
        connection.close()


# ADMIN: Delete a parking slot
@app.route("/api/admin/slots/<int:slot_id>", methods=["DELETE"])
@admin_required
def delete_admin_slot(slot_id):
    connection = get_db_connection()

    try:
        slot = connection.execute(
            "SELECT id FROM parking_slots WHERE id = ?",
            (slot_id,)
        ).fetchone()

        if slot is None:
            return jsonify({"error": "Parking slot not found."}), 404

        bookings = connection.execute(
            "SELECT COUNT(*) AS total FROM bookings WHERE slot_id = ?",
            (slot_id,)
        ).fetchone()

        if bookings["total"] > 0:
            return jsonify({
                "error": "Cannot delete this slot because booking records exist."
            }), 409

        connection.execute(
            "DELETE FROM parking_slots WHERE id = ?",
            (slot_id,)
        )

        connection.commit()

        return jsonify({
            "message": "Parking slot deleted successfully!"
        })

    finally:
        connection.close()
        # ADMIN LOGIN
@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json(silent=True) or {}

    username = data.get("username", "")
    password = data.get("password", "")

    if (
        username == ADMIN_USERNAME
        and check_password_hash(ADMIN_PASSWORD_HASH, password)
    ):
        session["admin_logged_in"] = True

        return jsonify({
            "message": "Login successful"
        }), 200

    return jsonify({
        "error": "Invalid username or password"
    }), 401


# ADMIN LOGOUT
@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.clear()

    return jsonify({
        "message": "Logged out successfully"
    }), 200
@app.route("/api/admin/bookings", methods=["GET"])
@admin_required
def get_admin_bookings():
    connection = get_db_connection()

    try:
        bookings = connection.execute("""
            SELECT
                bookings.id,
                bookings.customer_name,
                bookings.vehicle_number,
                parking_slots.slot_number,
                bookings.booking_date,
                bookings.start_time,
                bookings.end_time,
                bookings.status
            FROM bookings
            JOIN parking_slots
            ON bookings.slot_id = parking_slots.id
            ORDER BY bookings.id DESC
        """).fetchall()

        return jsonify([dict(booking) for booking in bookings])

    finally:
        connection.close()
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)