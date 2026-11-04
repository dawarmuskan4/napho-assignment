import { Suspense } from "react";
import ClaimView from "@/components/ClaimView";

export default function ClaimPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ClaimView />
    </Suspense>
  );
}
