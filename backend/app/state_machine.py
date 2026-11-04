TRANSITIONS = {
    ("DRAFT", "submit"): "SUBMITTED",
    ("SUBMITTED", "approve"): "APPROVED",
    ("SUBMITTED", "reject"): "REJECTED",
    ("REJECTED", "reopen"): "DRAFT",  # triggered by editing a rejected claim
    ("APPROVED", "pay"): "PAID",
}


class InvalidTransition(Exception):
    """Routers map this to HTTP 409."""


def next_status(status: str, action: str) -> str:
    try:
        return TRANSITIONS[(status, action)]
    except KeyError:
        raise InvalidTransition(f"Cannot {action} a claim that is {status}") from None
