import os
import sys

BACKEND_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, BACKEND_PATH)

from app import app


def client():
    app.config["TESTING"] = True
    return app.test_client()


def test_home_page_loads():
    response = client().get("/")
    assert response.status_code == 200
    assert response.content_type.startswith("text/html")


def test_health_api():
    response = client().get("/api/health")
    assert response.status_code == 200
    assert response.get_json()["status"] == "success"


def test_booking_list_requires_admin_login():
    response = client().get("/api/bookings")
    assert response.status_code == 401
    assert response.get_json()["error"] == "Admin login required."


def test_booking_cancellation_requires_admin_login():
    response = client().delete("/api/bookings/1")
    assert response.status_code == 401


def test_admin_booking_routes_require_login():
    test_client = client()
    paths = [
        ("/api/admin/bookings", "get"),
        ("/api/admin/activity-logs", "get"),
        ("/api/admin/overstay", "get"),
        ("/api/admin/verify-qr", "post"),
        ("/api/admin/bookings/1/check-in", "post"),
        ("/api/admin/bookings/1/check-out", "post"),
        ("/api/admin/slots", "post"),
        ("/api/admin/slots/1", "delete"),
    ]
    for path, method in paths:
        response = getattr(test_client, method)(path, json={})
        assert response.status_code == 401, f"{method.upper()} {path} was not protected"


def test_booking_rejects_non_object_json():
    response = client().post("/api/bookings", json=["not", "an", "object"])
    assert response.status_code == 400


def test_booking_rejects_wrong_field_types():
    response = client().post("/api/bookings", json={
        "customer_name": 123,
        "vehicle_number": "KA01AB1234",
        "slot_number": "P01",
        "booking_date": "2026-11-20",
        "start_time": "10:00",
        "end_time": "11:00",
    })
    assert response.status_code == 400


def test_admin_login_rejects_non_string_credentials():
    response = client().post("/api/admin/login", json={"username": [], "password": {}})
    assert response.status_code == 401


def test_old_predictable_qr_endpoint_is_not_available():
    response = client().get("/api/bookings/1/qr")
    assert response.status_code == 404
