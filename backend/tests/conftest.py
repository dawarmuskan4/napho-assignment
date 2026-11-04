import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import auth
from app.db import create_tables, get_db
from app.main import app
from app.seed import DEMO_PASSWORD, seed  # noqa: F401  (tests import DEMO_PASSWORD from here)

# seed order: ids 1-4
ASHA, ROHAN, MEERA, VIKRAM = 1, 2, 3, 4
EMAILS = {ASHA: "asha@example.com", ROHAN: "rohan@example.com", MEERA: "meera@example.com", VIKRAM: "vikram@example.com"}


@pytest.fixture(autouse=True)
def fast_password_hashing(monkeypatch):
    monkeypatch.setattr(auth, "SCRYPT_N", 2**4)  # real value is slow on purpose; tests don't need that


@pytest.fixture
def session_factory(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    create_tables(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as db:
        seed(db)
    return factory


@pytest.fixture
def client(session_factory):
    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
