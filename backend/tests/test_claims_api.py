from datetime import date, timedelta

import pytest

from app.models import Category, Claim, Status
from tests.conftest import ASHA, MEERA, ROHAN, VIKRAM


def h(user_id):
    return {"X-User-Id": str(user_id)}


def new_claim(client, user=ASHA, **overrides):
    body = {"title": "Client dinner", "category": "food", "description": "Team dinner",
            "expense_date": date.today().isoformat(), "amount_paise": 800000, **overrides}
    r = client.post("/claims", json=body, headers=h(user))
    assert r.status_code == 201, r.text
    return r.json()


def act(client, claim, action, user, **body):
    return client.post(f"/claims/{claim['id']}/{action}", json=body, headers=h(user))


def submitted_claim(client, **overrides):
    claim = new_claim(client, **overrides)
    r = act(client, claim, "submit", ASHA)
    assert r.status_code == 200, r.text
    return r.json()


def actions(claim):
    return [e["action"] for e in claim["events"]]


# ---------- flows ----------


def test_happy_path_create_submit_approve_pay(client):
    claim = new_claim(client)
    assert claim["status"] == "DRAFT"

    claim = act(client, claim, "submit", ASHA).json()
    claim = act(client, claim, "approve", MEERA).json()
    assert claim["status"] == "APPROVED" and claim["approved_amount_paise"] == 800000
    claim = act(client, claim, "pay", MEERA).json()

    assert claim["status"] == "PAID"
    assert actions(claim) == ["created", "submitted", "approved", "paid"]
    assert client.get(f"/claims/{claim['id']}", headers=h(ASHA)).json()["status"] == "PAID"


def test_partial_approval_requires_comment(client):
    claim = submitted_claim(client)  # ₹8,000 claimed

    r = act(client, claim, "approve", MEERA, approved_amount_paise=650000)
    assert r.status_code == 422

    r = act(client, claim, "approve", MEERA, approved_amount_paise=650000, comment="Dinner over policy limit")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "APPROVED"
    assert body["approved_amount_paise"] == 650000 and body["amount_paise"] == 800000
    assert body["events"][-1]["comment"] == "Dinner over policy limit"


def test_reject_edit_resubmit_approve(client):
    claim = submitted_claim(client)
    claim = act(client, claim, "reject", MEERA, comment="Missing details").json()
    assert claim["status"] == "REJECTED"

    r = client.patch(f"/claims/{claim['id']}", json={"amount_paise": 700000}, headers=h(ASHA))
    assert r.status_code == 200
    claim = r.json()
    assert claim["status"] == "DRAFT" and claim["amount_paise"] == 700000
    assert claim["events"][-1]["action"] == "reopened"

    claim = act(client, claim, "submit", ASHA).json()
    claim = act(client, claim, "approve", VIKRAM).json()
    assert claim["status"] == "APPROVED"
    assert actions(claim) == ["created", "submitted", "rejected", "reopened", "submitted", "approved"]


def test_edit_draft_logs_updated_event(client):
    claim = new_claim(client)
    r = client.patch(f"/claims/{claim['id']}", json={"title": "New title"}, headers=h(ASHA))
    assert r.status_code == 200
    assert r.json()["title"] == "New title"
    assert actions(r.json()) == ["created", "updated"]


# ---------- invalid transitions + concurrency ----------


def test_approve_a_draft_is_409(client):
    claim = new_claim(client)
    assert act(client, claim, "approve", MEERA).status_code == 409


def test_pay_a_rejected_claim_is_409(client):
    claim = submitted_claim(client)
    claim = act(client, claim, "reject", MEERA, comment="No receipt").json()
    assert act(client, claim, "pay", MEERA).status_code == 409


def test_edit_a_submitted_claim_is_409(client):
    claim = submitted_claim(client)
    r = client.patch(f"/claims/{claim['id']}", json={"title": "x"}, headers=h(ASHA))
    assert r.status_code == 409


def test_duplicate_submit_second_is_409(client):
    claim = new_claim(client)
    assert act(client, claim, "submit", ASHA).status_code == 200
    assert act(client, claim, "submit", ASHA).status_code == 409
    events = client.get(f"/claims/{claim['id']}", headers=h(ASHA)).json()["events"]
    assert actions({"events": events}).count("submitted") == 1


def test_two_approvers_exactly_one_wins(client):
    claim = submitted_claim(client)
    first = act(client, claim, "approve", MEERA)
    second = act(client, claim, "reject", VIKRAM, comment="No")
    assert first.status_code == 200
    assert second.status_code == 409
    final = client.get(f"/claims/{claim['id']}", headers=h(MEERA)).json()
    assert final["status"] == "APPROVED"
    assert actions(final) == ["created", "submitted", "approved"]


# ---------- validation ----------


@pytest.mark.parametrize("overrides", [
    {"amount_paise": -100},
    {"amount_paise": 0},
    {"amount_paise": 100_000_001},
    {"expense_date": (date.today() + timedelta(days=1)).isoformat()},
    {"title": ""},
    {"title": "x" * 121},
    {"category": "gifts"},
])
def test_create_validation_is_422(client, overrides):
    body = {"title": "t", "category": "food", "expense_date": date.today().isoformat(), "amount_paise": 100, **overrides}
    assert client.post("/claims", json=body, headers=h(ASHA)).status_code == 422


def test_approved_more_than_claimed_is_422(client):
    claim = submitted_claim(client)
    assert act(client, claim, "approve", MEERA, approved_amount_paise=800001).status_code == 422


@pytest.mark.parametrize("body", [{}, {"comment": ""}, {"comment": "   "}])
def test_reject_without_comment_is_422(client, body):
    claim = submitted_claim(client)
    assert act(client, claim, "reject", MEERA, **body).status_code == 422


# ---------- authorization ----------


def test_missing_or_unknown_user_is_401(client):
    assert client.get("/claims").status_code == 401
    assert client.get("/claims", headers=h(999)).status_code == 401
    assert client.get("/claims", headers={"X-User-Id": "abc"}).status_code == 401


def test_employee_cannot_approve_or_reject_or_pay(client):
    claim = submitted_claim(client)
    for action, extra in [("approve", {}), ("reject", {"comment": "x"}), ("pay", {})]:
        assert act(client, claim, action, ASHA, **extra).status_code == 403


def test_approver_cannot_create_or_submit(client):
    body = {"title": "t", "category": "food", "expense_date": date.today().isoformat(), "amount_paise": 100}
    assert client.post("/claims", json=body, headers=h(MEERA)).status_code == 403
    claim = new_claim(client)
    assert act(client, claim, "submit", MEERA).status_code == 403


def test_employee_cannot_see_or_touch_another_employees_claim(client):
    claim = new_claim(client, user=ASHA)
    assert client.get(f"/claims/{claim['id']}", headers=h(ROHAN)).status_code == 404
    assert act(client, claim, "submit", ROHAN).status_code == 404
    assert client.patch(f"/claims/{claim['id']}", json={"title": "x"}, headers=h(ROHAN)).status_code == 404
    assert client.delete(f"/claims/{claim['id']}", headers=h(ROHAN)).status_code == 404
    assert client.get("/claims", headers=h(ROHAN)).json() == []


def test_approver_cannot_approve_own_claim(client, session_factory):
    with session_factory() as db:  # approvers can't create claims via the API, so insert one directly
        own = Claim(employee_id=MEERA, title="t", category=Category.food, expense_date=date.today(),
                    amount_paise=100, status=Status.SUBMITTED)
        db.add(own)
        db.commit()
        claim_id = own.id
    r = client.post(f"/claims/{claim_id}/approve", json={}, headers=h(MEERA))
    assert r.status_code == 403
    assert client.post(f"/claims/{claim_id}/approve", json={}, headers=h(VIKRAM)).status_code == 200


# ---------- listing + delete ----------


def test_lists_employee_sees_own_approver_sees_non_draft(client):
    draft = new_claim(client, user=ASHA)
    sub = submitted_claim(client)
    new_claim(client, user=ROHAN)

    asha_ids = {c["id"] for c in client.get("/claims", headers=h(ASHA)).json()}
    assert asha_ids == {draft["id"], sub["id"]}

    approver_ids = {c["id"] for c in client.get("/claims", headers=h(MEERA)).json()}
    assert approver_ids == {sub["id"]}
    assert client.get(f"/claims/{draft['id']}", headers=h(MEERA)).status_code == 404

    only = client.get("/claims?status=SUBMITTED", headers=h(MEERA)).json()
    assert [c["id"] for c in only] == [sub["id"]]


def test_delete_never_submitted_draft(client):
    claim = new_claim(client)
    assert client.delete(f"/claims/{claim['id']}", headers=h(ASHA)).status_code == 204
    assert client.get(f"/claims/{claim['id']}", headers=h(ASHA)).status_code == 404


def test_cannot_delete_reopened_claim_or_submitted_claim(client):
    claim = submitted_claim(client)
    assert client.delete(f"/claims/{claim['id']}", headers=h(ASHA)).status_code == 409

    claim = act(client, claim, "reject", MEERA, comment="No").json()
    claim = client.patch(f"/claims/{claim['id']}", json={"title": "fixed"}, headers=h(ASHA)).json()
    assert claim["status"] == "DRAFT"  # back to draft, but it has review history
    assert client.delete(f"/claims/{claim['id']}", headers=h(ASHA)).status_code == 409


def test_users_endpoint_needs_no_auth(client):
    assert [u["name"] for u in client.get("/users").json()] == ["Asha", "Rohan", "Meera", "Vikram"]


def test_response_has_names_and_utc_timestamps(client):
    claim = submitted_claim(client)
    claim = act(client, claim, "approve", MEERA).json()
    assert claim["employee_name"] == "Asha"
    last = claim["events"][-1]
    assert (last["actor_name"], last["actor_role"]) == ("Meera", "approver")
    assert "claim_id" not in last
    assert claim["created_at"].endswith("Z") or claim["created_at"].endswith("+00:00")
    assert last["created_at"].endswith("Z") or last["created_at"].endswith("+00:00")
