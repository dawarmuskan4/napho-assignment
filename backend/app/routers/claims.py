from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas, services
from app.auth import get_current_user
from app.db import get_db
from app.models import Claim, Status, User

router = APIRouter()


def _detail(db: Session, claim: Claim) -> schemas.ClaimDetail:
    return schemas.ClaimDetail(
        **schemas.ClaimOut.model_validate(claim).model_dump(),
        events=services.get_events(db, claim.id),
    )


@router.get("/users", response_model=list[schemas.UserOut])
def list_users(db: Session = Depends(get_db)):
    return db.scalars(select(User).order_by(User.id)).all()


@router.get("/claims", response_model=list[schemas.ClaimOut])
def list_claims(status: Status | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return services.list_claims(db, user, status)


@router.post("/claims", response_model=schemas.ClaimDetail, status_code=201)
def create_claim(body: schemas.ClaimCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _detail(db, services.create_claim(db, user, body.model_dump()))


@router.get("/claims/{claim_id}", response_model=schemas.ClaimDetail)
def get_claim(claim_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _detail(db, services.get_claim(db, user, claim_id))


@router.patch("/claims/{claim_id}", response_model=schemas.ClaimDetail)
def update_claim(claim_id: int, body: schemas.ClaimUpdate, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    changes = body.model_dump(exclude_unset=True)
    changes = {k: v for k, v in changes.items() if v is not None or k == "description"}  # description may be cleared
    return _detail(db, services.update_claim(db, user, claim_id, changes))


@router.delete("/claims/{claim_id}", status_code=204)
def delete_claim(claim_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    services.delete_claim(db, user, claim_id)
    return Response(status_code=204)


@router.post("/claims/{claim_id}/submit", response_model=schemas.ClaimDetail)
def submit_claim(claim_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _detail(db, services.submit_claim(db, user, claim_id))


@router.post("/claims/{claim_id}/approve", response_model=schemas.ClaimDetail)
def approve_claim(claim_id: int, body: schemas.ApproveBody, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    claim = services.approve_claim(db, user, claim_id, body.approved_amount_paise, body.comment)
    return _detail(db, claim)


@router.post("/claims/{claim_id}/reject", response_model=schemas.ClaimDetail)
def reject_claim(claim_id: int, body: schemas.RejectBody, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    return _detail(db, services.reject_claim(db, user, claim_id, body.comment))


@router.post("/claims/{claim_id}/pay", response_model=schemas.ClaimDetail)
def pay_claim(claim_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _detail(db, services.pay_claim(db, user, claim_id))
