import { Banknote, CircleCheck, CircleX, Clock, FilePen, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Status } from "@/lib/api";

const STYLES: Record<Status, { icon: LucideIcon; className: string }> = {
  DRAFT: { icon: FilePen, className: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300" },
  SUBMITTED: { icon: Clock, className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  APPROVED: { icon: CircleCheck, className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  REJECTED: { icon: CircleX, className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  PAID: { icon: Banknote, className: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
};

export default function StatusBadge({ status }: { status: Status }) {
  const { icon: Icon, className } = STYLES[status];
  return (
    <Badge variant="secondary" className={className}>
      <Icon />
      {status}
    </Badge>
  );
}
