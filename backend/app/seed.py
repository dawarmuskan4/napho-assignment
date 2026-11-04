from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.db import SessionLocal, create_tables
from app.models import Role, User

DEMO_PASSWORD = "Password@123"

USERS = [
    ("Asha", "asha@example.com", Role.employee),
    ("Rohan", "rohan@example.com", Role.employee),
    ("Meera", "meera@example.com", Role.approver),
    ("Vikram", "vikram@example.com", Role.approver),
]


def seed(db: Session) -> None:
    """Idempotent: only inserts users that don't exist yet."""
    for name, email, role in USERS:
        if db.scalar(select(User).where(User.email == email)) is None:
            db.add(User(name=name, email=email, password_hash=hash_password(DEMO_PASSWORD), role=role))
    db.commit()


if __name__ == "__main__":
    create_tables()
    with SessionLocal() as db:
        seed(db)
        print(f"Users in DB: {db.query(User).count()}")
