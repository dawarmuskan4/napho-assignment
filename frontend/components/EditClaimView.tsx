"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import ClaimForm from "@/components/ClaimForm";
import { api, errorMessage, type ClaimDetail } from "@/lib/api";
import { useRequireUser } from "@/lib/user";

export default function EditClaimView() {
  const { id } = useParams<{ id: string }>();
  const user = useRequireUser();
  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    api<ClaimDetail>(`/claims/${id}`)
      .then(setClaim)
      .catch((e) => setError(errorMessage(e)));
  }, [user, id]);

  if (error) return <p className="text-destructive">{error}</p>;
  if (!claim) return <p>Loading…</p>;
  if (claim.status !== "DRAFT" && claim.status !== "REJECTED") {
    return <p>A {claim.status} claim cannot be edited.</p>;
  }
  return <ClaimForm claim={claim} />;
}
