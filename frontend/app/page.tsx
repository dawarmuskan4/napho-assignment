"use client";

import { Banknote, CircleCheck, CircleX, Clock, FilePen, Plus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import ClaimTable from "@/components/ClaimTable";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorMessage, type Claim, type Status } from "@/lib/api";
import { useRequireUser } from "@/lib/user";

const SUMMARY: { label: string; status: Status; icon: LucideIcon; color: string }[] = [
  { label: "Draft", status: "DRAFT", icon: FilePen, color: "text-stone-500" },
  { label: "Pending", status: "SUBMITTED", icon: Clock, color: "text-sky-600 dark:text-sky-400" },
  { label: "Approved", status: "APPROVED", icon: CircleCheck, color: "text-emerald-600 dark:text-emerald-400" },
  { label: "Rejected", status: "REJECTED", icon: CircleX, color: "text-red-600 dark:text-red-400" },
  { label: "Paid", status: "PAID", icon: Banknote, color: "text-violet-600 dark:text-violet-400" },
];

export default function Dashboard() {
  const user = useRequireUser();
  const [mine, setMine] = useState<Claim[] | null>(null);
  const [toReview, setToReview] = useState<Claim[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"review" | "reviewed">("review");

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api<Claim[]>("/claims"),
      user.role === "approver" ? api<Claim[]>("/claims?scope=review") : Promise.resolve([]),
    ])
      .then(([myClaims, reviewClaims]) => {
        setMine(myClaims);
        setToReview(reviewClaims);
        setError("");
      })
      .catch((e) => setError(errorMessage(e)));
  }, [user]);

  if (!user) return <p>Loading…</p>;
  if (error) return <p className="text-destructive">{error}</p>;
  if (!mine || !toReview) return <p>Loading…</p>;

  const reviewShown = toReview.filter((c) => (tab === "review" ? c.status === "SUBMITTED" : c.status !== "SUBMITTED"));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Hi {user.name}</h1>
        <Link href="/claims/new" className={buttonVariants({ size: "lg" })}>
          <Plus />
          New claim
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {SUMMARY.map(({ label, status, icon: Icon, color }) => (
          <Card key={status} size="sm">
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{mine.filter((c) => c.status === status).length}</p>
                <p className="text-sm text-muted-foreground">{label}</p>
              </div>
              <Icon className={`size-6 ${color}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      <section>
        <h2 className="mb-3 font-semibold">My claims</h2>
        <ClaimTable claims={mine} showEmployee={false} />
      </section>

      {user.role === "approver" && (
        <section>
          <h2 className="mb-3 font-semibold">Claims from others</h2>
          <Tabs value={tab} onValueChange={(v) => setTab(v as "review" | "reviewed")} className="mb-3">
            <TabsList>
              <TabsTrigger value="review">To review</TabsTrigger>
              <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
            </TabsList>
          </Tabs>
          <ClaimTable claims={reviewShown} showEmployee />
        </section>
      )}
    </div>
  );
}
