"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ClaimTable from "@/components/ClaimTable";
import { api, errorMessage, type Claim } from "@/lib/api";
import { useUser } from "@/lib/user";

export default function Home() {
  const { user, error: userError } = useUser();
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"review" | "reviewed">("review");

  useEffect(() => {
    if (!user) return;
    api<Claim[]>("/claims")
      .then((list) => {
        setClaims(list);
        setError("");
      })
      .catch((e) => setError(errorMessage(e)));
  }, [user]);

  if (userError) return <p className="text-red-600">{userError}</p>;
  if (!user) return <p>Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!claims) return <p>Loading…</p>;

  if (user.role === "employee") {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">My claims</h1>
          <Link href="/claims/new" className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white">
            New claim
          </Link>
        </div>
        <ClaimTable claims={claims} showEmployee={false} />
      </div>
    );
  }

  const shown = claims.filter((c) => (tab === "review" ? c.status === "SUBMITTED" : c.status !== "SUBMITTED"));
  const tabClass = (active: boolean) =>
    `rounded px-3 py-1.5 text-sm ${active ? "bg-blue-600 text-white" : "border border-gray-400"}`;

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Claims</h1>
      <div className="mb-4 flex gap-2">
        <button className={tabClass(tab === "review")} onClick={() => setTab("review")}>
          To review
        </button>
        <button className={tabClass(tab === "reviewed")} onClick={() => setTab("reviewed")}>
          Reviewed
        </button>
      </div>
      <ClaimTable claims={shown} showEmployee />
    </div>
  );
}
