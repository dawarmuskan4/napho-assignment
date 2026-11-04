"use client";

import { ArrowLeft, Banknote, Check, CircleAlert, Info, Pencil, Send, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useRequireUser } from "@/lib/user";

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
  const user = useRequireUser();
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
  if (!claim) return <p className="text-destructive">{error || "Loading…"}</p>;

  const isOwner = claim.employee_id === user.id;
  const canReview = user.role === "approver" && !isOwner;
  const neverSubmitted = !claim.events.some((e) => e.action === "submitted");
  const rejection =
    claim.status === "REJECTED" ? [...claim.events].reverse().find((e) => e.action === "rejected") : null;
  const partial = claim.approved_amount_paise !== null && claim.approved_amount_paise < claim.amount_paise;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/" className="flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
          <ArrowLeft className="size-4" />
          Back
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-bold">{claim.title}</h1>
          <StatusBadge status={claim.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {claim.employee_name} · <span className="capitalize">{claim.category}</span> · {claim.expense_date}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <div className="flex flex-col gap-6 md:col-span-2">
          <Card>
            <CardContent>
              <p className="text-2xl font-semibold">
                {claim.approved_amount_paise === null
                  ? formatRupees(claim.amount_paise)
                  : partial
                    ? `Approved ${formatRupees(claim.approved_amount_paise!)} of ${formatRupees(claim.amount_paise)}`
                    : `Approved ${formatRupees(claim.approved_amount_paise!)}`}
              </p>
              {claim.description && <p className="mt-2 text-sm text-muted-foreground">{claim.description}</p>}
            </CardContent>
          </Card>

          {rejection?.comment && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>
                Rejected by {rejection.actor_name}: {rejection.comment}
              </AlertDescription>
            </Alert>
          )}

          {isOwner && (claim.status === "DRAFT" || claim.status === "REJECTED") && (
            <div className="flex flex-wrap gap-2">
              <Link href={`/claims/${claim.id}/edit`} className={buttonVariants({ variant: "outline", size: "lg" })}>
                <Pencil />
                {claim.status === "REJECTED" ? "Edit to resubmit" : "Edit"}
              </Link>
              {claim.status === "DRAFT" && (
                <Button size="lg" disabled={busy} onClick={() => run(() => post("submit"))}>
                  <Send />
                  Submit
                </Button>
              )}
              {claim.status === "DRAFT" && neverSubmitted && (
                <Button size="lg" variant="destructive" disabled={busy} onClick={remove}>
                  <Trash2 />
                  Delete
                </Button>
              )}
            </div>
          )}

          {canReview && claim.status === "SUBMITTED" && (
            <Card>
              <CardHeader>
                <CardTitle>Review</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="approved-amount">Approved amount (₹), claimed {formatRupees(claim.amount_paise)}</Label>
                  <Input
                    id="approved-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={approvedRupees}
                    onChange={(e) => setApprovedRupees(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="review-comment">Comment (required to reject or to approve less than claimed)</Label>
                  <Textarea
                    id="review-comment"
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="lg" disabled={busy} onClick={approve}>
                    <Check />
                    Approve
                  </Button>
                  <Button size="lg" variant="destructive" disabled={busy} onClick={reject}>
                    <X />
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {canReview && claim.status === "APPROVED" && (
            <div>
              <Button size="lg" disabled={busy} onClick={() => run(() => post("pay"))}>
                <Banknote />
                Mark paid
              </Button>
            </div>
          )}

          {user.role === "approver" && isOwner && claim.status === "SUBMITTED" && (
            <Alert>
              <Info />
              <AlertDescription>This is your own claim. Another approver has to review it.</AlertDescription>
            </Alert>
          )}
        </div>

        <aside>
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-4 border-l-2 pl-4">
                {claim.events.map((e) => (
                  <li key={e.id} className="text-sm">
                    <p>{eventText(e)}</p>
                    {e.comment && <p className="italic text-muted-foreground">“{e.comment}”</p>}
                    <p className="text-xs text-muted-foreground">
                      {e.from_status ? `${e.from_status} → ${e.to_status}` : e.to_status} ·{" "}
                      {formatDateTime(e.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
