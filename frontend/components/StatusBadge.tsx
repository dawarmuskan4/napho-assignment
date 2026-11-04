import type { Status } from "@/lib/api";

const COLORS: Record<Status, string> = {
  DRAFT: "bg-gray-200 text-gray-800",
  SUBMITTED: "bg-blue-100 text-blue-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  PAID: "bg-purple-100 text-purple-800",
};

export default function StatusBadge({ status }: { status: Status }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${COLORS[status]}`}>{status}</span>;
}
