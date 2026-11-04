from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal, create_tables
from app.models import Role, User

USERS = [
    ("Asha", Role.employee),
    ("Rohan", Role.employee),
    ("Meera", Role.approver),
    ("Vikram", Role.approver),
]


def seed(db: Session) -> None:
    """Idempotent: only inserts users that don't exist yet."""
    for name, role in USERS:
        if db.scalar(select(User).where(User.name == name)) is None:
            db.add(User(name=name, role=role))
    db.commit()


if __name__ == "__main__":
    create_tables()
    with SessionLocal() as db:
        seed(db)
        print(f"Users in DB: {db.query(User).count()}")
