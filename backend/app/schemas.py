from datetime import date, datetime, timezone
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from app.models import Category, Role, Status

MAX_AMOUNT_PAISE = 100_000_000  # ₹10,00,000


def _not_in_future(value: date) -> date:
    if value > date.today():
        raise ValueError("expense_date cannot be in the future")
    return value


def _as_utc(value: datetime) -> datetime:
    # SQLite drops the timezone; without it browsers read the time as local time
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


UtcDatetime = Annotated[datetime, AfterValidator(_as_utc)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Description = Annotated[str, StringConstraints(max_length=1000)]
Comment = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
ExpenseDate = Annotated[date, AfterValidator(_not_in_future)]
Amount = Annotated[int, Field(gt=0, le=MAX_AMOUNT_PAISE)]


class ClaimCreate(BaseModel):
    title: Title
    category: Category
    description: Description | None = None
    expense_date: ExpenseDate
    amount_paise: Amount


class ClaimUpdate(BaseModel):
    """Only the fields sent are changed."""

    title: Title | None = None
    category: Category | None = None
    description: Description | None = None
    expense_date: ExpenseDate | None = None
    amount_paise: Amount | None = None


class ApproveBody(BaseModel):
    approved_amount_paise: Amount | None = None  # defaults to the full amount
    comment: Comment | None = None


class RejectBody(BaseModel):
    comment: Comment


class LoginBody(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: Role


class LoginOut(BaseModel):
    token: str
    user: UserOut


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    action: str
    actor_id: int
    actor_name: str
    actor_role: Role
    from_status: Status | None
    to_status: Status
    amount_paise: int
    approved_amount_paise: int | None
    comment: str | None
    created_at: UtcDatetime


class ClaimOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    employee_name: str
    title: str
    category: Category
    description: str | None
    expense_date: date
    amount_paise: int
    approved_amount_paise: int | None
    status: Status
    created_at: UtcDatetime
    updated_at: UtcDatetime


class ClaimDetail(ClaimOut):
    events: list[EventOut]
