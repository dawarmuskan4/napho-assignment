"use client";

import { CircleAlert, Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  const submitAfterSave = useRef(true); // which of the two buttons was pressed

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
      if (submitAfterSave.current) {
        try {
          await api(`/claims/${saved.id}/submit`, { method: "POST", body: {} });
        } catch {
          router.push(`/claims/${saved.id}`); // saved as a draft; the claim page shows its real state
          return;
        }
        router.push("/");
      } else {
        router.push(claim ? `/claims/${saved.id}` : "/");
      }
    } catch (err) {
      setError(errorMessage(err));
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center">
      <Card className="w-full max-w-lg shadow-md">
        <CardHeader>
          <CardTitle className="text-xl">{claim ? "Edit claim" : "New claim"}</CardTitle>
          <CardDescription>
            {claim ? "Update the details, then save or submit." : "Fill in the details, then submit or save a draft."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="flex flex-col gap-4">
            {claim?.status === "REJECTED" && (
              <Alert>
                <CircleAlert />
                <AlertDescription>Saving moves this claim back to DRAFT. You can then submit it again.</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger id="category" className="w-full capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="expense-date">Expense date</Label>
                <Input
                  id="expense-date"
                  type="date"
                  value={expenseDate}
                  max={new Date().toLocaleDateString("en-CA")}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="amount">Amount (₹)</Label>
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  min="0.01"
                  step="0.01"
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
            </div>
            {error && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="lg" disabled={busy} onClick={() => (submitAfterSave.current = true)}>
                <Send />
                {busy ? "Saving…" : claim ? "Save & submit" : "Submit claim"}
              </Button>
              <Button
                type="submit"
                size="lg"
                variant="outline"
                disabled={busy}
                onClick={() => (submitAfterSave.current = false)}
              >
                <Save />
                {claim ? "Save" : "Save as draft"}
              </Button>
              <Button type="button" size="lg" variant="ghost" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
