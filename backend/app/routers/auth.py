from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.auth import create_session, end_session, get_current_user, get_token, verify_password
from app.db import get_db
from app.models import User

router = APIRouter(prefix="/auth")


@router.post("/login", response_model=schemas.LoginOut)
def login(body: schemas.LoginBody, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Wrong email or password")  # same message for both on purpose
    return schemas.LoginOut(token=create_session(db, user), user=user)


@router.post("/logout", status_code=204)
def logout(token: str = Depends(get_token), db: Session = Depends(get_db)):
    end_session(db, token)
    return Response(status_code=204)


@router.get("/me", response_model=schemas.UserOut)
def me(user: User = Depends(get_current_user)):
    return user
