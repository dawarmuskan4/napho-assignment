import pytest

from app.state_machine import TRANSITIONS, InvalidTransition, next_status


@pytest.mark.parametrize(("status", "action", "expected"), [(s, a, n) for (s, a), n in TRANSITIONS.items()])
def test_valid_transitions(status, action, expected):
    assert next_status(status, action) == expected


def test_all_five_valid_transitions_covered():
    assert len(TRANSITIONS) == 5


@pytest.mark.parametrize(
    ("status", "action"),
    [
        ("DRAFT", "approve"),
        ("DRAFT", "pay"),
        ("SUBMITTED", "submit"),
        ("SUBMITTED", "pay"),
        ("REJECTED", "pay"),
        ("REJECTED", "approve"),
        ("APPROVED", "reject"),
        ("APPROVED", "submit"),
        ("PAID", "pay"),
        ("PAID", "reopen"),
        ("DRAFT", "unknown"),
    ],
)
def test_invalid_transitions_raise(status, action):
    with pytest.raises(InvalidTransition):
        next_status(status, action)
