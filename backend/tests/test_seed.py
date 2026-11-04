from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db import create_tables
from app.models import User
from app.seed import seed


def test_seed_creates_four_users_and_is_idempotent():
    engine = create_engine("sqlite://")
    create_tables(engine)
    with Session(engine) as db:
        seed(db)
        seed(db)
        assert db.query(User).count() == 4
