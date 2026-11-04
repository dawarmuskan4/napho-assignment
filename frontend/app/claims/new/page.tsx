"use client";

import ClaimForm from "@/components/ClaimForm";
import { useUser } from "@/lib/user";

export default function NewClaimPage() {
  const { user } = useUser();
  if (!user) return <p>Loading…</p>;
  if (user.role !== "employee") return <p>Only employees can create claims. Switch user in the header.</p>;
  return <ClaimForm />;
}
