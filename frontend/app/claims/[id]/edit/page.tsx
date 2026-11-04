import { Suspense } from "react";
import EditClaimView from "@/components/EditClaimView";

export default function EditClaimPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <EditClaimView />
    </Suspense>
  );
}
