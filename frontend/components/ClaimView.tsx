"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import {
  api,
  ApiError,
  errorMessage,
  formatDateTime,
  formatRupees,
  paiseToRupees,
  rupeesToPaise,
  type ClaimDetail,
  type ClaimEvent,
} from "@/lib/api";
import { useUser } from "@/lib/user";

function eventText(e: ClaimEvent): string {
  const who = `${e.actor_name} (${e.actor_role})`;
  switch (e.action) {
    case "created":
      return `${who} created the claim`;
    case "updated":
      return `${who} edited the claim`;
    case "reopened":
      return `${who} edited the rejected claim, moved back to DRAFT`;
    case "approved": {
      const partial = e.approved_amount_paise !== null && e.approved_amount_paise < e.amount_paise;
      return partial
        ? `${who} approved ${formatRupees(e.approved_amount_paise!)} of ${formatRupees(e.amount_paise)}`
        : `${who} approved ${formatRupees(e.approved_amount_paise ?? e.amount_paise)}`;
    }
    default:
      return `${who} ${e.action} the claim`;
  }
}

export default function ClaimView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false); // state is too slow to block two clicks in the same tick
  const [approvedRupees, setApprovedRupees] = useState("");
  const [comment, setComment] = useState("");

  const load = useCallback(
    () =>
      api<ClaimDetail>(`/claims/${id}`)
        .then((data) => {
          setError("");
          setComment("");
          setClaim(data);
          setApprovedRupees(paiseToRupees(data.amount_paise)); // approval defaults to the full amount
        })
        .catch((e) => {
          setClaim(null);
          setError(errorMessage(e));
        }),
    [id],
  );

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Runs one action. Buttons stay disabled while it is in flight.
  // On 409/404 the claim changed under us: reload it so the buttons match reality. Then show the message.
  // Other errors (e.g. 422) keep what the user typed.
  async function run(fn: () => Promise<ClaimDetail | void>, after?: () => void) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      if (after) return after();
      if (result) {
        setClaim(result);
        setApprovedRupees(paiseToRupees(result.amount_paise));
        setComment("");
      }
    } catch (e) {
      const message = errorMessage(e);
      if (e instanceof ApiError && (e.status === 409 || e.status === 404)) await load();
      setError(message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const post = (action: string, body: object = {}) =>
    api<ClaimDetail>(`/claims/${id}/${action}`, { method: "POST", body });

  function approve() {
    const paise = rupeesToPaise(approvedRupees);
    if (!(paise > 0)) return setError("Enter an approved amount greater than 0");
    run(() => post("approve", { approved_amount_paise: paise, comment: comment.trim() || undefined }));
  }

  function reject() {
    if (!comment.trim()) return setError("A comment is required to reject");
    run(() => post("reject", { comment: comment.trim() }));
  }

  function remove() {
    if (!window.confirm("Delete this draft?")) return;
    run(
      () => api(`/claims/${id}`, { method: "DELETE" }),
      () => router.push("/"),
    );
  }

  if (!user) return <p>Loading…</p>;
  if (!claim) return <p className="text-red-600">{error || "Loading…"}</p>;

  const isOwner = user.role === "employee" && claim.employee_id === user.id;
  const neverSubmitted = !claim.events.some((e) => e.action === "submitted");
  const rejection = claim.status === "REJECTED" ? [...claim.events].reverse().find((e) => e.action === "rejected") : null;
  const partial = claim.approved_amount_paise !== null && claim.approved_amount_paise < claim.amount_paise;
  const button = "rounded px-4 py-1.5 text-white disabled:opacity-50";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/" className="text-sm text-blue-600 underline">
          ← Back
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-bold">{claim.title}</h1>
          <StatusBadge status={claim.status} />
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {claim.employee_name} · <span className="capitalize">{claim.category}</span> · {claim.expense_date}
        </p>
      </div>

      {error && <p className="rounded bg-red-100 p-2 text-sm text-red-800">{error}</p>}

      <div>
        <p className="text-lg font-semibold">
          {claim.approved_amount_paise === null
            ? formatRupees(claim.amount_paise)
            : partial
              ? `Approved ${formatRupees(claim.approved_amount_paise!)} of ${formatRupees(claim.amount_paise)}`
              : `Approved ${formatRupees(claim.approved_amount_paise!)}`}
        </p>
        {claim.description && <p className="mt-2 text-sm">{claim.description}</p>}
      </div>

      {rejection?.comment && (
        <p className="rounded bg-red-50 p-2 text-sm text-red-900">
          Rejected by {rejection.actor_name}: {rejection.comment}
        </p>
      )}

      {isOwner && (claim.status === "DRAFT" || claim.status === "REJECTED") && (
        <div className="flex gap-2">
          <Link href={`/claims/${claim.id}/edit`} className="rounded border border-gray-400 px-4 py-1.5">
            {claim.status === "REJECTED" ? "Edit to resubmit" : "Edit"}
          </Link>
          {claim.status === "DRAFT" && (
            <button disabled={busy} onClick={() => run(() => post("submit"))} className={`${button} bg-blue-600`}>
              Submit
            </button>
          )}
          {claim.status === "DRAFT" && neverSubmitted && (
            <button disabled={busy} onClick={remove} className={`${button} bg-red-600`}>
              Delete
            </button>
          )}
        </div>
      )}

      {user.role === "approver" && claim.status === "SUBMITTED" && (
        <div className="flex max-w-lg flex-col gap-3 rounded border border-gray-300 p-4">
          <h2 className="font-semibold">Review</h2>
          <label className="text-sm">
            Approved amount (₹), claimed {formatRupees(claim.amount_paise)}
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="w-full rounded border border-gray-400 bg-transparent px-2 py-1.5"
              value={approvedRupees}
              onChange={(e) => setApprovedRupees(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Comment (required to reject or to approve less than claimed)
            <textarea
              className="w-full rounded border border-gray-400 bg-transparent px-2 py-1.5"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button disabled={busy} onClick={approve} className={`${button} bg-green-600`}>
              Approve
            </button>
            <button disabled={busy} onClick={reject} className={`${button} bg-red-600`}>
              Reject
            </button>
          </div>
        </div>
      )}

      {user.role === "approver" && claim.status === "APPROVED" && (
        <div>
          <button disabled={busy} onClick={() => run(() => post("pay"))} className={`${button} bg-purple-600`}>
            Mark paid
          </button>
        </div>
      )}

      <div>
        <h2 className="mb-2 font-semibold">History</h2>
        <ol className="flex flex-col gap-3 border-l-2 border-gray-300 pl-4">
          {claim.events.map((e) => (
            <li key={e.id} className="text-sm">
              <p>{eventText(e)}</p>
              {e.comment && <p className="italic text-gray-600">“{e.comment}”</p>}
              <p className="text-xs text-gray-500">
                {e.from_status ? `${e.from_status} → ${e.to_status}` : e.to_status} · {formatDateTime(e.created_at)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
