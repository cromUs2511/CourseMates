from pathlib import Path
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app

ICEBREAKER_BODY = {
    "contractVersion": 1,
    "topic": "Calculus",
    "discipline": "Engineering",
    "campus": "Main Campus",
}


def _post(path: str, body: dict, token: str | None = None):
    headers = {"X-CM-Internal-Token": token} if token is not None else {}
    return TestClient(app).post(path, json=body, headers=headers)


def test_internal_post_routes_stay_open_without_a_configured_token(monkeypatch) -> None:
    monkeypatch.delenv("ORCHESTRATOR_INTERNAL_TOKEN", raising=False)

    assert _post("/internal/v1/icebreakers", ICEBREAKER_BODY).status_code == 200
    assert TestClient(app).get("/internal/v1/health").status_code == 200


def test_internal_post_routes_require_the_shared_secret_when_configured(monkeypatch) -> None:
    monkeypatch.setenv("ORCHESTRATOR_INTERNAL_TOKEN", "test-secret")

    client = TestClient(app)
    assert client.post("/internal/v1/icebreakers", json=ICEBREAKER_BODY).status_code == 401
    assert (
        client.post(
            "/internal/v1/icebreakers", json=ICEBREAKER_BODY, headers={"X-CM-Internal-Token": "wrong"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/internal/v1/match/select",
            json={
                "contractVersion": 1,
                "candidate": {"id": "new", "verified": True, "interests": ["Calculus"], "allowNormal": False},
                "queued": [],
            },
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/internal/v1/moderation", json={"contractVersion": 1, "text": "hello"}
        ).status_code
        == 401
    )


def test_internal_post_routes_accept_the_configured_token_and_health_stays_open(monkeypatch) -> None:
    monkeypatch.setenv("ORCHESTRATOR_INTERNAL_TOKEN", "test-secret")

    client = TestClient(app)
    headers = {"X-CM-Internal-Token": "test-secret"}
    assert client.post("/internal/v1/icebreakers", json=ICEBREAKER_BODY, headers=headers).status_code == 200
    assert (
        client.post(
            "/internal/v1/match/select",
            json={
                "contractVersion": 1,
                "candidate": {"id": "new", "verified": True, "interests": ["Calculus"], "allowNormal": False},
                "queued": [],
            },
            headers=headers,
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/internal/v1/moderation", json={"contractVersion": 1, "text": "hello"}, headers=headers
        ).status_code
        == 200
    )
    assert client.get("/internal/v1/health").status_code == 200
