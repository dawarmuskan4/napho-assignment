"""Login: passwords are hashed with scrypt, sessions are random tokens stored (hashed) in the DB."""

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import LoginSession, User, utcnow

SCRYPT_N = 2**14  # tests lower this to stay fast; the value used is stored in each hash
SESSION_HOURS = 8


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=8, p=1)
    return f"scrypt${SCRYPT_N}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    _, n, salt, digest = stored.split("$")
    check = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=8, p=1)
    return hmac.compare_digest(check.hex(), digest)


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    db.add(LoginSession(token_hash=_digest(token), user_id=user.id, expires_at=utcnow() + timedelta(hours=SESSION_HOURS)))
    db.commit()
    return token


def end_session(db: Session, token: str) -> None:
    session = db.get(LoginSession, _digest(token))
    if session is not None:
        db.delete(session)
        db.commit()


def get_token(authorization: str | None = Header(default=None)) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Please log in")
    return token


def get_current_user(token: str = Depends(get_token), db: Session = Depends(get_db)) -> User:
    session = db.get(LoginSession, _digest(token))
    expires = session.expires_at if session else None
    if expires is not None and expires.tzinfo is None:  # SQLite drops the timezone
        expires = expires.replace(tzinfo=timezone.utc)
    if session is None or expires <= datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired, please log in again")
    return db.get(User, session.user_id)
