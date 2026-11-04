import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./reimbursement.db")  # Docker points this at a volume
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def create_tables(bind=engine):
    from app import models  # noqa: F401  (registers the tables on Base)

    Base.metadata.create_all(bind)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
