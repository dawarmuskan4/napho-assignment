from datetime import datetime, timedelta, timezone

from app.models import LoginSession
from tests.conftest import DEMO_PASSWORD, EMAILS, MEERA


def login(client, email=EMAILS[MEERA], password=DEMO_PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


def test_login_returns_token_and_user_without_password_hash(client):
    r = login(client)
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["name"] == "Meera" and body["user"]["role"] == "approver"
    assert "password" not in str(body).lower()
    assert body["token"]


def test_email_is_case_and_space_insensitive(client):
    assert login(client, email="  MEERA@Example.com ").status_code == 200


def test_wrong_password_and_unknown_email_get_the_same_401(client):
    wrong_password = login(client, password="nope")
    unknown_email = login(client, email="nobody@example.com")
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


def test_me_returns_the_logged_in_user(client):
    token = login(client).json()["token"]
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200 and r.json()["email"] == EMAILS[MEERA]
    assert client.get("/auth/me").status_code == 401


def test_logout_ends_only_that_session(client):
    first = login(client).json()["token"]
    second = login(client).json()["token"]
    auth = lambda t: {"Authorization": f"Bearer {t}"}
    assert client.post("/auth/logout", headers=auth(first)).status_code == 204
    assert client.get("/auth/me", headers=auth(first)).status_code == 401
    assert client.get("/auth/me", headers=auth(second)).status_code == 200


def test_expired_session_is_401(client, session_factory):
    token = login(client).json()["token"]
    with session_factory() as db:
        for s in db.query(LoginSession):
            s.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
