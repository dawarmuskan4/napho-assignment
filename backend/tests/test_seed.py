from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db import create_tables
from app.auth import verify_password
from app.models import User
from app.seed import DEMO_PASSWORD, seed


def test_seed_creates_four_users_and_is_idempotent():
    engine = create_engine("sqlite://")
    create_tables(engine)
    with Session(engine) as db:
        seed(db)
        seed(db)
        assert db.query(User).count() == 4
        asha = db.query(User).filter_by(email="asha@example.com").one()
        assert asha.password_hash != DEMO_PASSWORD  # stored hashed
        assert verify_password(DEMO_PASSWORD, asha.password_hash)
