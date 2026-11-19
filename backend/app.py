from flask import Flask, jsonify, request, send_from_directory, session, redirect
from werkzeug.security import generate_password_hash, check_password_hash
import os
import secrets
import io
import re
import qrcode

from flask import send_file
from functools import wraps



from datetime import datetime, timedelta
from dotenv import load_dotenv
from database import get_db_connection, initialize_database

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

# Load local environment variables
load_dotenv(os.path.join(BASE_DIR, ".env"))

# Application environment
SMARTPARK_ENV = os.environ.get(
    "SMARTPARK_ENV", "development"
).lower()

SECRET_KEY = os.environ.get("SMARTPARK_SECRET_KEY")
ADMIN_USERNAME = os.environ.get("SMARTPARK_ADMIN_USERNAME")
ADMIN_PASSWORD = os.environ.get("SMARTPARK_ADMIN_PASSWORD")

# Never allow demo credentials in production
if SMARTPARK_ENV == "production":

    if not SECRET_KEY or len(SECRET_KEY) < 32:
        raise RuntimeError(
            "A strong SMARTPARK_SECRET_KEY is required."
        )

    if not ADMIN_USERNAME or not ADMIN_PASSWORD:
        raise RuntimeError(
            "Production admin credentials are required."
        )

    if len(ADMIN_PASSWORD) < 12:
        raise RuntimeError(
            "Production admin password must be at least 12 characters."
        )

else:
    SECRET_KEY = SECRET_KEY or "development-only-secret"
    ADMIN_USERNAME = ADMIN_USERNAME or "admin"
    ADMIN_PASSWORD = ADMIN_PASSWORD or "SmartPark@123"

app = Flask(__name__)

app.config.update(
    SECRET_KEY=SECRET_KEY,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=(
        os.environ.get("SMARTPARK_COOKIE_SECURE", "false").lower()
        == "true"
    ),
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8)
)

ADMIN_PASSWORD_HASH = generate_password_hash(ADMIN_PASSWORD)


app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = os.environ.get(
    "SMARTPARK_COOKIE_SECURE", "false"
).lower() in ("1", "true", "yes")

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("admin_logged_in"):
            return jsonify({"error": "Admin login required."}), 401

        return f(*args, **kwargs)

    return decorated_function
def log_activity(action, description, booking_id=None):
    connection = get_db_connection()

    try:
        created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        connection.execute("""
            INSERT INTO activity_logs (
                action, description, booking_id, created_at
            )
            VALUES (?, ?, ?, ?)
        """, (action, description, booking_id, created_at))

        connection.commit()

    finally:
        connection.close()
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
    connection = None

    try:
        connection = get_db_connection()
        connection.execute("SELECT 1")

        return jsonify({
            "status": "success",
            "message": "SmartPark backend is healthy!",
            "database": "connected"
        }), 200

    except Exception:
        app.logger.exception("SmartPark health check failed")

        return jsonify({
            "status": "error",
            "message": "Application or database unavailable"
        }), 503

    finally:
        if connection:
            connection.close()


# Get all parking slots
# Get parking slots with time-based availability
@app.route("/api/slots")
def get_slots():
    booking_date = request.args.get("date")
    start_time = request.args.get("start_time")
    end_time = request.args.get("end_time")

    # Validate date and time if provided
    if any([booking_date, start_time, end_time]):
        if not all([booking_date, start_time, end_time]):
            return jsonify({
                "error": "Please provide booking date, start time and end time."
            }), 400

        try:
            datetime.strptime(booking_date, "%Y-%m-%d")
            start_value = datetime.strptime(start_time, "%H:%M").time()
            end_value = datetime.strptime(end_time, "%H:%M").time()
        except ValueError:
            return jsonify({"error": "Invalid date or time format."}), 400

        if start_value >= end_value:
            return jsonify({
                "error": "End time must be later than start time."
            }), 400

    connection = get_db_connection()

    try:
        if booking_date and start_time and end_time:
            slots = connection.execute("""
                SELECT
                    parking_slots.id,
                    parking_slots.slot_number,
                    CASE
                        WHEN EXISTS (
                            SELECT 1
                            FROM bookings
                            WHERE bookings.slot_id = parking_slots.id
                            AND bookings.booking_date = ?
                            AND bookings.status = 'Confirmed'
                            AND bookings.start_time < ?
                            AND bookings.end_time > ?
                        )
                        THEN 'Reserved'
                        ELSE parking_slots.status
                    END AS status
                FROM parking_slots
                ORDER BY parking_slots.id
            """, (booking_date, end_time, start_time)).fetchall()
        else:
            slots = connection.execute("""
                SELECT * FROM parking_slots ORDER BY id
            """).fetchall()
            
        return jsonify([dict(slot) for slot in slots])

    finally:
        connection.close()
# Recommend the first available parking slot
# Smart recommendation system
@app.route("/api/recommend-slot")
def recommend_slot():
    booking_date = request.args.get("date")
    start_time = request.args.get("start_time")
    end_time = request.args.get("end_time")

    if not all([booking_date, start_time, end_time]):
        return jsonify({
            "error": "Please provide date, start time and end time."
        }), 400

    try:
        datetime.strptime(booking_date, "%Y-%m-%d")
        start_value = datetime.strptime(start_time, "%H:%M").time()
        end_value = datetime.strptime(end_time, "%H:%M").time()
    except ValueError:
        return jsonify({"error": "Invalid date or time format."}), 400

    if start_value >= end_value:
        return jsonify({
            "error": "End time must be later than start time."
        }), 400

    connection = get_db_connection()

    try:
        slots = connection.execute("""
            SELECT parking_slots.slot_number
            FROM parking_slots
            WHERE parking_slots.status = 'Available'
            AND NOT EXISTS (
                SELECT 1
                FROM bookings
                WHERE bookings.slot_id = parking_slots.id
                AND bookings.booking_date = ?
                AND bookings.status = 'Confirmed'
                AND bookings.start_time < ?
                AND bookings.end_time > ?
            )
            ORDER BY parking_slots.id
        """, (booking_date, end_time, start_time)).fetchall()

        if not slots:
            return jsonify({
                "message": "No available parking slots for this time."
            }), 404

        # Simple transparent priority scoring
        candidates = []
        for slot in slots:
            slot_number = slot["slot_number"]
            try:
                slot_number_value = int(slot_number[1:])
            except (ValueError, IndexError):
                slot_number_value = 9999

            score = slot_number_value

            candidates.append({
                "slot_number": slot_number,
                "score": score
            })

        candidates.sort(key=lambda item: item["score"])
        best_slot = candidates[0]

        return jsonify({
            "message": "Best available parking slot recommended!",
            "recommended_slot": best_slot["slot_number"],
            "reason": "This slot is available for your selected date and time.",
            "available_slots_count": len(candidates),
            "recommendation_method": "Availability-based priority scoring"
        })

    finally:
        connection.close()
# Create a new parking booking
@app.route("/api/bookings", methods=["POST"])
def create_booking():

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "A valid JSON booking object is required."}), 400

    required_fields = (
        "customer_name", "vehicle_number", "slot_number",
        "booking_date", "start_time", "end_time"
    )
    if any(not isinstance(data.get(field), str) for field in required_fields):
        return jsonify({"error": "All booking fields must be text values."}), 400

    customer_name = data["customer_name"].strip()
    vehicle_number = data["vehicle_number"].strip().upper()
    slot_number = data["slot_number"].strip().upper()
    booking_date = data["booking_date"].strip()
    start_time = data["start_time"].strip()
    end_time = data["end_time"].strip()

    if not 2 <= len(customer_name) <= 80:
        return jsonify({"error": "Customer name must contain 2 to 80 characters."}), 400
    if not re.fullmatch(r"[A-Z0-9 -]{4,15}", vehicle_number):
        return jsonify({"error": "Enter a valid vehicle number (4 to 15 letters, numbers, spaces or hyphens)."}), 400
    if not re.fullmatch(r"[A-Z0-9-]{1,10}", slot_number):
        return jsonify({"error": "Enter a valid parking slot number."}), 400

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

        
        qr_token = secrets.token_urlsafe(32)

        cursor = connection.execute("""
            INSERT INTO bookings (
                slot_id,
                customer_name,
                vehicle_number,
                booking_date,
                start_time,
                end_time,
                qr_token
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            slot["id"],
            customer_name,
            vehicle_number,
            booking_date,
            start_time,
            end_time,
            qr_token
        ))

        booking_id = cursor.lastrowid
        connection.commit()
        log_activity(
            "Booking Created",
            f"New booking created for {customer_name}, vehicle {vehicle_number}.",
        booking_id
     )

        return jsonify({
            "message": "Parking booked successfully!",
            "booking_id": booking_id,
            "slot_number": slot_number,
            "qr_token": qr_token
        }), 201

    finally:
        connection.close()


# Generate a QR image only when the caller has the unguessable booking token.
# Booking IDs alone must never reveal a customer's QR pass.
@app.route("/api/booking-qr/<token>")
def get_booking_qr(token):
    if not token or len(token) > 128:
        return jsonify({"error": "Invalid QR pass."}), 404

    connection = get_db_connection()
    try:
        booking = connection.execute("""
            SELECT qr_token, status
            FROM bookings
            WHERE qr_token = ?
        """, (token,)).fetchone()

        if booking is None or booking["status"] != "Confirmed":
            return jsonify({"error": "Invalid or inactive QR pass."}), 404

        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(token)
        qr.make(fit=True)
        image = qr.make_image(fill_color="black", back_color="white")
        image_buffer = io.BytesIO()
        image.save(image_buffer, format="PNG")
        image_buffer.seek(0)

        response = send_file(image_buffer, mimetype="image/png")
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
        response.headers["Pragma"] = "no-cache"
        return response
    finally:
        connection.close()


# Get all booking records

# Get all booking records - admin access only

# Get all booking records - admin access only
@app.route("/api/bookings", methods=["GET"])
@admin_required
def get_bookings():

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

# Admin vehicle check-in
@app.route("/api/admin/bookings/<int:booking_id>/check-in", methods=["POST"])
@admin_required
def check_in_vehicle(booking_id):
    connection = get_db_connection()

    try:
        booking = connection.execute("""
            SELECT *
            FROM bookings
            WHERE id = ?
        """, (booking_id,)).fetchone()

        if booking is None:
            return jsonify({"error": "Booking not found."}), 404

        if booking["status"] != "Confirmed":
            return jsonify({"error": "Only confirmed bookings can be checked in."}), 400

        if booking["check_in_time"] is not None:
            return jsonify({"error": "Vehicle is already checked in."}), 400

        check_in_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        connection.execute("""
            UPDATE bookings
            SET check_in_time = ?
            WHERE id = ?
        """, (check_in_time, booking_id))

        connection.commit()
        

        log_activity(
            "Vehicle Check-in",
            f"Vehicle checked in for booking #{booking_id}.",booking_id
    )
        return jsonify({
            "message": "Vehicle checked in successfully!",
            "booking_id": booking_id,
            "check_in_time": check_in_time
        })

    finally:
        connection.close()
# Admin vehicle check-out
@app.route("/api/admin/bookings/<int:booking_id>/check-out", methods=["POST"])
@admin_required
def check_out_vehicle(booking_id):
    connection = get_db_connection()

    try:
        booking = connection.execute("""
            SELECT *
            FROM bookings
            WHERE id = ?
        """, (booking_id,)).fetchone()

        if booking is None:
            return jsonify({"error": "Booking not found."}), 404

        if booking["check_in_time"] is None:
            return jsonify({
                "error": "Vehicle must be checked in first."
            }), 400

        if booking["check_out_time"] is not None:
            return jsonify({
                "error": "Vehicle is already checked out."
            }), 400

        check_out_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        connection.execute("""
            UPDATE bookings
            SET check_out_time = ?
            WHERE id = ?
        """, (check_out_time, booking_id))

        connection.commit()
        log_activity(
            "Vehicle Check-out",
            f"Vehicle checked out for booking #{booking_id}.",booking_id
        )
        return jsonify({
            "message": "Vehicle checked out successfully!",
            "booking_id": booking_id,
            "check_out_time": check_out_time
        })

    finally:
        connection.close()
# ADMIN: Verify QR pass and check in vehicle
@app.route("/api/admin/verify-qr", methods=["POST"])
@admin_required
def verify_qr_pass():

    data = request.get_json(silent=True) or {}
    qr_token = str(data.get("qr_token", "")).strip()

    if not qr_token:
        return jsonify({"error": "QR token is required."}), 400

    connection = get_db_connection()

    try:
        booking = connection.execute("""
            SELECT
                bookings.id,
                bookings.customer_name,
                bookings.vehicle_number,
                bookings.booking_date,
                bookings.start_time,
                bookings.end_time,
                bookings.status,
                bookings.check_in_time,
                bookings.check_out_time,
                parking_slots.slot_number
            FROM bookings
            JOIN parking_slots
                ON bookings.slot_id = parking_slots.id
            WHERE bookings.qr_token = ?
        """, (qr_token,)).fetchone()

        if booking is None:
            return jsonify({"error": "Invalid QR pass."}), 404

        if booking["status"] != "Confirmed":
            return jsonify({"error": "Booking is not active."}), 400

        if booking["check_in_time"] is not None:
            return jsonify({
                "error": "This QR pass has already been used for check-in."
            }), 409

        check_in_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        connection.execute("""
            UPDATE bookings
            SET check_in_time = ?
            WHERE id = ?
        """, (check_in_time, booking["id"]))

        connection.commit()

        log_activity(
            "QR Vehicle Check-in",
            f"QR check-in completed for booking #{booking['id']}.",
            booking["id"]
        )

        return jsonify({
            "message": "QR verified. Vehicle checked in successfully!",
            "booking_id": booking["id"],
            "customer_name": booking["customer_name"],
            "vehicle_number": booking["vehicle_number"],
            "slot_number": booking["slot_number"],
            "booking_date": booking["booking_date"],
            "start_time": booking["start_time"],
            "end_time": booking["end_time"],
            "check_in_time": check_in_time
        }), 200

    finally:
        connection.close()

# Customer cancellation using the secure QR token

# CUSTOMER: View bookings using saved QR tokens
@app.route("/api/customer/bookings/list", methods=["POST"])
def customer_booking_list():
    data = request.get_json(silent=True) or {}
    tokens = data.get("qr_tokens", [])

    if not isinstance(tokens, list):
        return jsonify({"error": "Invalid booking tokens."}), 400

    tokens = list(dict.fromkeys(
        token for token in tokens
        if isinstance(token, str) and 1 <= len(token) <= 128
    ))

    if len(tokens) > 50:
        return jsonify({"error": "Too many booking tokens."}), 400

    if not tokens:
        return jsonify([]), 200

    placeholders = ",".join("?" for _ in tokens)

    connection = get_db_connection()

    try:
        bookings = connection.execute(f"""
            SELECT
                bookings.id,
                bookings.customer_name,
                bookings.vehicle_number,
                parking_slots.slot_number,
                bookings.booking_date,
                bookings.start_time,
                bookings.end_time,
                bookings.status,
                bookings.check_in_time,
                bookings.check_out_time,
                bookings.qr_token
            FROM bookings
            JOIN parking_slots
                ON bookings.slot_id = parking_slots.id
            WHERE bookings.qr_token IN ({placeholders})
            ORDER BY bookings.id DESC
        """, tokens).fetchall()

        return jsonify([dict(booking) for booking in bookings]), 200

    finally:
        connection.close()


# CUSTOMER: Cancel booking using its secure QR token
@app.route("/api/customer/bookings/cancel", methods=["POST"])
def customer_cancel_booking():
    data = request.get_json(silent=True) or {}
    qr_token = data.get("qr_token")

    if not isinstance(qr_token, str) or not 1 <= len(qr_token) <= 128:
        return jsonify({
            "error": "A valid booking token is required."
        }), 400

    connection = get_db_connection()

    try:
        booking = connection.execute("""
            SELECT * FROM bookings
            WHERE qr_token = ?
        """, (qr_token,)).fetchone()

        if booking is None:
            return jsonify({
                "error": "Booking not found."
            }), 404

        if booking["status"] == "Cancelled":
            return jsonify({
                "error": "This booking is already cancelled."
            }), 400

        if (
            booking["status"] != "Confirmed"
            or booking["check_in_time"] is not None
            or booking["check_out_time"] is not None
        ):
            return jsonify({
                "error": "This booking can no longer be cancelled."
            }), 409

        connection.execute("""
            UPDATE bookings
            SET status = 'Cancelled'
            WHERE id = ?
        """, (booking["id"],))

        connection.commit()

        log_activity(
            "Booking Cancelled",
            f"Customer cancelled booking #{booking['id']}.",
            booking["id"]
        )

        return jsonify({
            "message": "Your booking has been cancelled successfully!"
        }), 200

    finally:
        connection.close()



# Cancel an existing booking

@app.route("/api/bookings/<int:booking_id>", methods=["DELETE"])
@admin_required
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
        log_activity(
            "Booking Cancelled",
            f"Booking #{booking_id} was cancelled.",booking_id
        )
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

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid username or password"}), 401

    username = data.get("username", "")
    password = data.get("password", "")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "Invalid username or password"}), 401

    if (
        secrets.compare_digest(username, ADMIN_USERNAME)
        and check_password_hash(ADMIN_PASSWORD_HASH, password)
    ):
        session.clear()
        session.clear()
        session.permanent = True
        session["admin_logged_in"] = True
        session.permanent = False

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
                bookings.status,
                bookings.check_in_time,
                bookings.check_out_time
            FROM bookings
            JOIN parking_slots
            ON bookings.slot_id = parking_slots.id
            ORDER BY bookings.id DESC
        """).fetchall()

        return jsonify([dict(booking) for booking in bookings])

    finally:
        connection.close()
@app.route("/api/admin/activity-logs", methods=["GET"])
@admin_required
def get_activity_logs():
    connection = get_db_connection()

    try:
        logs = connection.execute("""
            SELECT
                id,
                action,
                description,
                booking_id,
                created_at
            FROM activity_logs
            ORDER BY id DESC
        """).fetchall()

        return jsonify([dict(log) for log in logs])

    finally:
        connection.close()
# ADMIN: Vehicle Overstay Detection
@app.route("/api/admin/overstay", methods=["GET"])
@admin_required
def get_overstay_vehicles():

    connection = get_db_connection()

    try:
        current_time = datetime.now()

        bookings = connection.execute("""
            SELECT
                bookings.id,
                bookings.customer_name,
                bookings.vehicle_number,
                parking_slots.slot_number,
                bookings.booking_date,
                bookings.start_time,
                bookings.end_time,
                bookings.check_in_time,
                bookings.check_out_time,
                bookings.status
            FROM bookings
            JOIN parking_slots
            ON bookings.slot_id = parking_slots.id
            WHERE bookings.status = 'Confirmed'
            AND bookings.check_in_time IS NOT NULL
            AND bookings.check_out_time IS NULL
            ORDER BY bookings.id DESC
        """).fetchall()

        overstay_vehicles = []

        for booking in bookings:

            scheduled_end = datetime.strptime(
                f"{booking['booking_date']} {booking['end_time']}",
                "%Y-%m-%d %H:%M"
            )

            if current_time > scheduled_end:

                overstay_minutes = int(
                    (current_time - scheduled_end).total_seconds() / 60
                )

                hours = overstay_minutes // 60
                minutes = overstay_minutes % 60

                overstay_vehicles.append({
                    "booking_id": booking["id"],
                    "customer_name": booking["customer_name"],
                    "vehicle_number": booking["vehicle_number"],
                    "slot_number": booking["slot_number"],
                    "booking_date": booking["booking_date"],
                    "scheduled_end_time": booking["end_time"],
                    "check_in_time": booking["check_in_time"],
                    "overstay_minutes": overstay_minutes,
                    "overstay_duration": f"{hours} hours {minutes} minutes",
                    "status": "Overstay"
                })

    

        return jsonify({
            "total_overstay_vehicles": len(overstay_vehicles),
            "overstay_vehicles": overstay_vehicles
        }), 200
    finally:
        connection.close()
        # ==========================================================
# CUSTOMER: VIEW MY BOOKINGS
# ==========================================================


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5002)),
        debug=False
    )   


