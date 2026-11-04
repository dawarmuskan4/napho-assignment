"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  api,
  CATEGORIES,
  errorMessage,
  paiseToRupees,
  rupeesToPaise,
  type Category,
  type ClaimDetail,
} from "@/lib/api";

// Create when no claim is passed, edit otherwise.
export default function ClaimForm({ claim }: { claim?: ClaimDetail }) {
  const router = useRouter();
  const [title, setTitle] = useState(claim?.title ?? "");
  const [category, setCategory] = useState<Category>(claim?.category ?? "travel");
  const [description, setDescription] = useState(claim?.description ?? "");
  const [expenseDate, setExpenseDate] = useState(claim?.expense_date ?? "");
  const [amount, setAmount] = useState(claim ? paiseToRupees(claim.amount_paise) : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false); // state is too slow to block two clicks in the same tick

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    const paise = rupeesToPaise(amount);
    if (!(paise > 0)) {
      setError("Enter an amount greater than 0");
      return;
    }
    const body = {
      title,
      category,
      description: description.trim() || null,
      expense_date: expenseDate,
      amount_paise: paise,
    };
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = claim
        ? await api<ClaimDetail>(`/claims/${claim.id}`, { method: "PATCH", body })
        : await api<ClaimDetail>("/claims", { method: "POST", body });
      router.push(`/claims/${saved.id}`);
    } catch (err) {
      setError(errorMessage(err));
      inFlight.current = false;
      setBusy(false);
    }
  }

  const input = "w-full rounded border border-gray-400 bg-transparent px-2 py-1.5";

  return (
    <form onSubmit={save} className="flex max-w-lg flex-col gap-4">
      <h1 className="text-xl font-bold">{claim ? "Edit claim" : "New claim"}</h1>
      {claim?.status === "REJECTED" && (
        <p className="rounded bg-yellow-100 p-2 text-sm text-yellow-900">
          Saving moves this claim back to DRAFT. You can then submit it again.
        </p>
      )}
      <label className="text-sm">
        Title
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
      </label>
      <label className="text-sm">
        Category
        <select className={input} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Description (optional)
        <textarea
          className={input}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
        />
      </label>
      <label className="text-sm">
        Expense date
        <input
          type="date"
          className={input}
          value={expenseDate}
          max={new Date().toLocaleDateString("en-CA")}
          onChange={(e) => setExpenseDate(e.target.value)}
          required
        />
      </label>
      <label className="text-sm">
        Amount (₹)
        <input
          type="number"
          className={input}
          value={amount}
          min="0.01"
          step="0.01"
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="rounded bg-blue-600 px-4 py-1.5 text-white disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => router.back()} className="rounded border border-gray-400 px-4 py-1.5">
          Cancel
        </button>
      </div>
    </form>
  );
}
