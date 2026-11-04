from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User


def get_current_user(x_user_id: str | None = Header(default=None), db: Session = Depends(get_db)) -> User:
    """Mock auth: the X-User-Id header names the acting user."""
    user = db.get(User, int(x_user_id)) if x_user_id and x_user_id.isdigit() else None
    if user is None:
        raise HTTPException(status_code=401, detail="Missing or unknown X-User-Id")
    return user
