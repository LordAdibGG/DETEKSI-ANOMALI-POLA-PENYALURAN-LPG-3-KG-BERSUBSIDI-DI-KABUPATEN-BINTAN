import os
from fastapi.testclient import TestClient

os.environ["ML_API_KEY"] = "lembar-pantau-ml-secret-2026"

from main import app  # noqa: E402

client = TestClient(app)


def test_health_requires_x_ml_key():
    response = client.get("/health")
    assert response.status_code == 401
    body = response.json()
    assert "X-ML-KEY" in body["detail"]


def test_health_rejects_invalid_x_ml_key():
    response = client.get("/health", headers={"X-ML-KEY": "kunci-salah"})
    assert response.status_code == 401


def test_health_succeeds_with_valid_x_ml_key():
    response = client.get(
        "/health",
        headers={"X-ML-KEY": "lembar-pantau-ml-secret-2026"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "lembar-pantau-ml"
    assert body["version"] == "0.1.0"
    assert body["data_ready"] is True
    assert body["files_found"] == 6
