# Reimbursement Management System

Employees submit expense claims. Approvers approve (in full or in part) or reject them, then mark them paid. Every change is recorded in a history. Users log in with an email and a password.

Flow: **create claim → submit → review → approve (full or partial) / reject → pay → view outcome**

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2, Pydantic v2, SQLite, pytest
- **Frontend:** Next.js (App Router, TypeScript, Tailwind), plain `fetch`, no state library

Design diagrams: `reimbursement-system-design.drawio` (open at app.diagrams.net). The build plan is in `PLAN.md`.

## Run it

You need Python 3.12 and Node 20+.

**Backend** (http://localhost:8000, API docs at http://localhost:8000/docs)

```bash
cd backend
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m app.seed                  # creates the DB and the 4 demo accounts (safe to re-run)
uvicorn app.main:app --reload
```

**Frontend** (http://localhost:3000)

```bash
cd frontend
npm install
npm run dev
```

The frontend calls `http://localhost:8000`. To use another address, set `NEXT_PUBLIC_API_URL`. The backend only allows CORS from `http://localhost:3000`.

**Tests**

```bash
cd backend
source venv/bin/activate
pytest
```

Each test gets its own temporary SQLite file. 55 tests cover login and sessions, the state machine, the full API, authorization, validation and parallel requests.

## Demo accounts

There is no registration. These four accounts are created by the seed command. They all use the password `Password@123`, which is also shown on the login page.

| Email | Name | Role |
|---|---|---|
| asha@example.com | Asha | employee |
| rohan@example.com | Rohan | employee |
| meera@example.com | Meera | approver |
| vikram@example.com | Vikram | approver |

Each browser tab has its own login, so you can open the same claim in two tabs as two different approvers and see the concurrency handling.

Try this: log in as Asha, create a claim with "Submit claim", and you land back on the dashboard. Log out, log in as Meera, open the claim from "To review", approve part of it (a comment is required), then "Mark paid". Log back in as Asha to see the outcome and the activity log. Then try reject, edit and resubmit. Meera can also create her own claim, but only Vikram can review it.

## Rules

**Who can do what**

- Any logged-in user can create claims, and can edit (DRAFT or REJECTED), delete (a draft that was never submitted) and submit their own.
- Approvers can also approve, reject and pay claims from other people. **An approver can never review their own claim**, so it is reviewed by the other approver.
- Everyone sees their own claims. Approvers also see other people's claims once they are submitted, never other people's drafts.
- The user comes from the login session. The server ignores anything the browser says about who it is.

**Claim lifecycle**

```
DRAFT --submit--> SUBMITTED --approve--> APPROVED --pay--> PAID
                      |
                      +--reject--> REJECTED --edit--> DRAFT
```

Editing a rejected claim moves it back to DRAFT (a `reopened` event is logged), then the owner submits again. Any move not in this table returns **409**.

**Validation**

- Title: 1 to 120 characters, required. Description: up to 1000 characters, optional.
- Category: travel, food, lodging, supplies, other.
- Expense date: required, not in the future.
- Amount: greater than 0, at most ₹10,00,000.
- Approval: `0 < approved amount ≤ claimed amount`. A comment is required when approving less than claimed.
- Reject: comment required.

**Errors**

| Code | Meaning |
|---|---|
| 401 | not logged in, session expired, or a wrong email or password |
| 403 | not an approver, or an approver reviewing their own claim |
| 404 | not found, also used for other employees' claims so IDs can't be probed |
| 409 | invalid transition, or the claim's status changed under you |
| 422 | validation error |

## API

Send the login token as `Authorization: Bearer <token>`. Only `POST /auth/login` works without it.

| Method | Path | Who | Body |
|---|---|---|---|
| POST | /auth/login | anyone | email, password. Returns the token and the user |
| POST | /auth/logout | logged in | ends this session |
| GET | /auth/me | logged in | the current user |
| GET | /claims | logged in | `?scope=mine` (default, your own claims) or `?scope=review` (approvers: other people's submitted claims), `?status=` filter |
| POST | /claims | logged in | title, category, description, expense_date, amount_paise |
| GET | /claims/{id} | owner, or an approver once it is submitted | returns the claim and its events |
| PATCH | /claims/{id} | owner | any of the fields above; REJECTED goes back to DRAFT |
| DELETE | /claims/{id} | owner | only a draft that was never submitted |
| POST | /claims/{id}/submit | owner | |
| POST | /claims/{id}/approve | approver (not the owner) | approved_amount_paise (optional, defaults to full), comment |
| POST | /claims/{id}/reject | approver (not the owner) | comment (required) |
| POST | /claims/{id}/pay | approver (not the owner) | |

## Data model

- **users:** `id`, `name`, `email` (unique), `password_hash`, `role` (employee or approver)
- **sessions:** `token_hash` (primary key), `user_id`, `expires_at`
- **claims:** `id`, `employee_id`, `title`, `category`, `description`, `expense_date`, `amount_paise`, `approved_amount_paise` (null until approved), `status`, `created_at`, `updated_at`
- **claim_events** (history, only ever inserted): `id`, `claim_id`, `actor_id`, `action` (created, updated, submitted, approved, rejected, reopened, paid), `from_status`, `to_status`, `amount_paise` and `approved_amount_paise` (snapshots), `comment`, `created_at`

Money is always **integer paise** in the database and the API. The frontend converts to and from rupees.

## Code layout

```
backend/app/
  main.py            app, CORS, error handlers
  db.py, models.py   engine, tables
  state_machine.py   TRANSITIONS lookup table
  services.py        business rules; every write goes through one function
  schemas.py         request/response validation
  auth.py            password hashing, login sessions, current-user dependency
  routers/auth.py    login, logout, me
  routers/claims.py  HTTP layer only
  seed.py            the 4 demo accounts
frontend/
  lib/api.ts         fetch wrapper, money helpers
  lib/user.tsx       login state and the redirect-to-login hook
  components/        header, claim form, claim page, table, badges
  app/               pages: login, dashboard, new claim, claim detail, edit
```

## Design decisions

| Decision | Instead of | Why |
|---|---|---|
| State machine as a lookup table | if/else in each endpoint | One place lists every legal move, and invalid moves are rejected the same way everywhere. |
| Conditional `UPDATE ... WHERE id = ? AND status = ?` | row locks, or nothing | SQLite has no `SELECT FOR UPDATE`. The update is atomic, so double clicks, stale pages and two approvers at once all hit one rule: one wins, the rest get 409. The event row is written in the same transaction. |
| Integer paise | float rupees | Floats can't hold money exactly. |
| `claims` plus `claim_events` | an events log only | Current state is a cheap read, and the history is still complete. |
| Partial approval as `approved_amount_paise` | a PARTIALLY_APPROVED status | It is still approved, only the amount differs. This keeps the state machine small. |
| Editing a rejected claim goes back to DRAFT | editing it in place | One editable state and one submit path. The rejection stays in the history. |
| Delete only never-submitted drafts | delete any draft | A reopened claim has review history, and deleting it would erase it. |
| 404 for other employees' claims | 403 | Doesn't reveal which IDs exist. |
| Random session token saved (hashed) in a `sessions` table | JWT | The server can end a session at logout and nothing is signed or decoded on the client. It needs no library: `secrets` and `hashlib` do the work. |
| Passwords hashed with scrypt (standard library) | plain text, or a hashing library | Hashes are salted and the cost is stored in each hash. No extra dependency. |
| Token kept in `sessionStorage` | `localStorage` or a cookie | Each tab has its own login, so two tabs can be two different people. A reload keeps you logged in. |
| Same message for unknown email and wrong password | separate messages | Doesn't reveal which emails have accounts. |

## Assumptions

- Single currency (INR), one amount per claim.
- "Pay" only records that payment was made. No money moves.
- Any approver except the claim's owner can approve and pay. The same approver can do both.
- Approvers see other people's claims only once they are submitted.
- When an approver acts on a draft by ID, they get 409 (invalid move), not 404.

## Known limitations

- **Accounts:** there is no registration, password change or password reset. The four accounts are fixed and share one demo password.
- **Sessions:** they expire after 8 hours, but expired rows are never cleaned up. There is no login rate limiting. The token sits in `sessionStorage`, so a cross-site scripting bug could read it. A production app would use an HttpOnly cookie.
- **Two edits to the same draft** in two tabs: the last save wins. The status doesn't change on an edit, so nothing detects it.
- **Duplicate creates:** the UI blocks double clicks, but an API client retrying `POST /claims` creates two drafts. An idempotency key would fix this.
- **Edit history is coarse:** an `updated` event doesn't say which field changed.
- **An empty `PATCH {}`** succeeds, logs an `updated` event, and moves a REJECTED claim back to DRAFT with nothing changed.
- **No separation of duties:** the approver who approved a claim can also pay it.
- **Deleting a never-submitted draft** also deletes its `created` and `updated` events. It is the only case where history rows are removed.
- No receipt upload and no line items.
- A claim can't be re-reviewed once approved.
- SQLite is fine for this size, not for many concurrent writers.
- Frontend behavior was checked by hand in a browser. There are no frontend tests.

## AI usage

I wrote the plan (`PLAN.md`) and the design diagrams. I used **Claude Code** to build the project one phase at a time (scaffold, data model, API, frontend, edge-case pass). I reviewed and committed each phase myself. Claude Code also wrote and ran the tests, and drove the browser to check the frontend flows.

Bugs found by the edge-case pass, such as two tabs sharing one user and a same-tick double click, are described in the phase 4 commit.
