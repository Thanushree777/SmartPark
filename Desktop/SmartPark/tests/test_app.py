import os
import sys

# Add the backend folder to Python's import path
BACKEND_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "backend")
)
sys.path.insert(0, BACKEND_PATH)

from app import app


def test_home_page_loads():
    app.testing = True
    client = app.test_client()

    response = client.get("/")

    assert response.status_code == 200


def test_health_api():
    app.testing = True
    client = app.test_client()

    response = client.get("/api/health")

    assert response.status_code == 200


def test_customer_dashboard_is_html():
    app.testing = True
    client = app.test_client()

    response = client.get("/")

    assert response.content_type.startswith("text/html")