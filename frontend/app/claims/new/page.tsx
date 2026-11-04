"use client";

import ClaimForm from "@/components/ClaimForm";
import { useRequireUser } from "@/lib/user";

export default function NewClaimPage() {
  const user = useRequireUser();
  if (!user) return <p>Loading…</p>;
  return <ClaimForm />;
}
