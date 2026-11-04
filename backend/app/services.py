"""Business rules. Every change is one conditional UPDATE (on status) plus one event row, in one transaction."""

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models import Claim, ClaimEvent, Role, Status, User, utcnow
from app.state_machine import next_status


class ServiceError(Exception):
    status_code = 400


class NotFound(ServiceError):
    status_code = 404


class Forbidden(ServiceError):
    status_code = 403


class Conflict(ServiceError):
    status_code = 409


class Invalid(ServiceError):
    status_code = 422


STALE = "This claim's status has changed. Reload and try again."


# ---------- loading + permission checks ----------


def _load(db: Session, claim_id: int) -> Claim:
    claim = db.get(Claim, claim_id)
    if claim is None:
        raise NotFound("Claim not found")
    return claim


def _load_owned(db: Session, user: User, claim_id: int) -> Claim:
    claim = _load(db, claim_id)
    if claim.employee_id != user.id:
        raise NotFound("Claim not found")  # 404, not 403: don't reveal other people's IDs
    return claim


def _load_for_review(db: Session, user: User, claim_id: int) -> Claim:
    if user.role != Role.approver:
        raise Forbidden("Only approvers can do this")
    claim = _load(db, claim_id)
    if claim.employee_id == user.id:
        raise Forbidden("You cannot review your own claim")
    return claim


# ---------- the one write path ----------


def _apply(db: Session, claim: Claim, actor: User, action: str, new_status: Status,
           values: dict | None = None, comment: str | None = None) -> Claim:
    """Conditional UPDATE (status must still be what we read), then the event row. 0 rows -> 409."""
    old_status = claim.status
    result = db.execute(
        update(Claim)
        .where(Claim.id == claim.id, Claim.status == claim.status)
        .values(**(values or {}), status=new_status, updated_at=utcnow())
    )
    if result.rowcount == 0:
        db.rollback()
        raise Conflict(STALE)
    db.refresh(claim)
    db.add(ClaimEvent(
        claim_id=claim.id, actor_id=actor.id, action=action, from_status=old_status, to_status=new_status,
        amount_paise=claim.amount_paise, approved_amount_paise=claim.approved_amount_paise, comment=comment,
    ))
    db.commit()
    return claim


# ---------- reads ----------


def list_claims(db: Session, user: User, status: Status | None, scope: str = "mine") -> list[Claim]:
    """scope "mine": my own claims. scope "review" (approvers): other people's claims that are past DRAFT."""
    query = select(Claim).order_by(Claim.id.desc())
    if scope == "review":
        if user.role != Role.approver:
            raise Forbidden("Only approvers can do this")
        query = query.where(Claim.employee_id != user.id, Claim.status != Status.DRAFT)
    else:
        query = query.where(Claim.employee_id == user.id)
    if status is not None:
        query = query.where(Claim.status == status)
    return list(db.scalars(query))


def get_claim(db: Session, user: User, claim_id: int) -> Claim:
    claim = _load(db, claim_id)
    if claim.employee_id == user.id:
        return claim
    if user.role == Role.employee or claim.status == Status.DRAFT:  # approvers can't see other people's drafts
        raise NotFound("Claim not found")
    return claim


def get_events(db: Session, claim_id: int) -> list[ClaimEvent]:
    return list(db.scalars(select(ClaimEvent).where(ClaimEvent.claim_id == claim_id).order_by(ClaimEvent.id)))


# ---------- employee actions ----------


def create_claim(db: Session, user: User, data: dict) -> Claim:
    claim = Claim(employee_id=user.id, status=Status.DRAFT, **data)
    db.add(claim)
    db.flush()
    db.add(ClaimEvent(
        claim_id=claim.id, actor_id=user.id, action="created", from_status=None, to_status=Status.DRAFT,
        amount_paise=claim.amount_paise,
    ))
    db.commit()
    return claim


def update_claim(db: Session, user: User, claim_id: int, changes: dict) -> Claim:
    claim = _load_owned(db, user, claim_id)
    if claim.status == Status.REJECTED:
        # editing a rejected claim sends it back to DRAFT
        return _apply(db, claim, user, "reopened", Status(next_status("REJECTED", "reopen")), changes)
    if claim.status == Status.DRAFT:
        return _apply(db, claim, user, "updated", Status.DRAFT, changes)
    raise Conflict(f"Cannot edit a claim that is {claim.status.value}")


def submit_claim(db: Session, user: User, claim_id: int) -> Claim:
    claim = _load_owned(db, user, claim_id)
    new_status = Status(next_status(claim.status.value, "submit"))
    return _apply(db, claim, user, "submitted", new_status)


def delete_claim(db: Session, user: User, claim_id: int) -> None:
    claim = _load_owned(db, user, claim_id)
    was_submitted = db.scalar(
        select(ClaimEvent.id).where(ClaimEvent.claim_id == claim.id, ClaimEvent.action == "submitted").limit(1)
    )
    if claim.status != Status.DRAFT or was_submitted:
        raise Conflict("Only a draft that was never submitted can be deleted")
    result = db.execute(delete(Claim).where(Claim.id == claim.id, Claim.status == Status.DRAFT))
    if result.rowcount == 0:
        db.rollback()
        raise Conflict(STALE)
    db.execute(delete(ClaimEvent).where(ClaimEvent.claim_id == claim.id))  # it never entered review
    db.commit()


# ---------- approver actions ----------


def approve_claim(db: Session, user: User, claim_id: int,
                  approved_amount_paise: int | None, comment: str | None) -> Claim:
    claim = _load_for_review(db, user, claim_id)
    new_status = Status(next_status(claim.status.value, "approve"))
    approved = claim.amount_paise if approved_amount_paise is None else approved_amount_paise
    if approved > claim.amount_paise:
        raise Invalid("Approved amount cannot be more than the claimed amount")
    if approved < claim.amount_paise and not comment:
        raise Invalid("A comment is required when approving less than the claimed amount")
    return _apply(db, claim, user, "approved", new_status, {"approved_amount_paise": approved}, comment)


def reject_claim(db: Session, user: User, claim_id: int, comment: str) -> Claim:
    claim = _load_for_review(db, user, claim_id)
    new_status = Status(next_status(claim.status.value, "reject"))
    return _apply(db, claim, user, "rejected", new_status, comment=comment)


def pay_claim(db: Session, user: User, claim_id: int) -> Claim:
    claim = _load_for_review(db, user, claim_id)
    new_status = Status(next_status(claim.status.value, "pay"))
    return _apply(db, claim, user, "paid", new_status)
