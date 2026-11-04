import enum
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, enum.Enum):
    employee = "employee"
    approver = "approver"


class Category(str, enum.Enum):
    travel = "travel"
    food = "food"
    lodging = "lodging"
    supplies = "supplies"
    other = "other"


class Status(str, enum.Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    PAID = "PAID"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(200), unique=True)
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[Role] = mapped_column(Enum(Role, native_enum=False))


class LoginSession(Base):
    __tablename__ = "sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)  # sha256 of the token we gave out
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Claim(Base):
    __tablename__ = "claims"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(120))
    category: Mapped[Category] = mapped_column(Enum(Category, native_enum=False))
    description: Mapped[str | None] = mapped_column(String(1000))
    expense_date: Mapped[date] = mapped_column(Date)
    amount_paise: Mapped[int] = mapped_column(Integer)
    approved_amount_paise: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[Status] = mapped_column(Enum(Status, native_enum=False), default=Status.DRAFT)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    employee: Mapped[User] = relationship(lazy="joined")

    @property
    def employee_name(self) -> str:
        return self.employee.name


class ClaimEvent(Base):
    """Append-only: rows are inserted, never updated or deleted."""

    __tablename__ = "claim_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[int] = mapped_column(ForeignKey("claims.id"))
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(20))  # created, updated, submitted, approved, rejected, reopened, paid
    from_status: Mapped[Status | None] = mapped_column(Enum(Status, native_enum=False))
    to_status: Mapped[Status] = mapped_column(Enum(Status, native_enum=False))
    amount_paise: Mapped[int] = mapped_column(Integer)  # snapshot at the time of the event
    approved_amount_paise: Mapped[int | None] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    actor: Mapped[User] = relationship(lazy="joined")

    @property
    def actor_name(self) -> str:
        return self.actor.name

    @property
    def actor_role(self) -> Role:
        return self.actor.role
