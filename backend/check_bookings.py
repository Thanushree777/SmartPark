from database import get_db_connection, initialize_database

connection = get_db_connection()

rows = connection.execute("""
    SELECT
        parking_slots.slot_number,
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM bookings
                WHERE bookings.slot_id = parking_slots.id
                AND bookings.booking_date = '2026-11-20'
                AND bookings.status = 'Confirmed'
                AND bookings.start_time < '11:00'
                AND bookings.end_time > '10:00'
            )
            THEN 'Reserved'
            ELSE parking_slots.status
        END AS status
    FROM parking_slots
    WHERE parking_slots.slot_number IN ('P02', 'P09')
""").fetchall()

for row in rows:
    print(dict(row))

connection.close()