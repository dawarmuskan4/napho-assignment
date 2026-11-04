"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupees, type Claim } from "@/lib/api";

export default function ClaimTable({ claims, showEmployee }: { claims: Claim[]; showEmployee: boolean }) {
  const router = useRouter();

  if (claims.length === 0) return <p className="py-4 text-sm text-muted-foreground">No claims here.</p>;

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            {showEmployee && <TableHead>Employee</TableHead>}
            <TableHead>Category</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {claims.map((c) => (
            <TableRow
              key={c.id}
              className="cursor-pointer"
              onClick={(e) => {
                if (!(e.target as HTMLElement).closest("a")) router.push(`/claims/${c.id}`); // the title link handles its own click
              }}
            >
              <TableCell>
                <Link href={`/claims/${c.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                  {c.title}
                </Link>
              </TableCell>
              {showEmployee && <TableCell>{c.employee_name}</TableCell>}
              <TableCell className="capitalize">{c.category}</TableCell>
              <TableCell>{c.expense_date}</TableCell>
              <TableCell>
                {c.approved_amount_paise !== null && c.approved_amount_paise < c.amount_paise
                  ? `${formatRupees(c.approved_amount_paise)} of ${formatRupees(c.amount_paise)}`
                  : formatRupees(c.amount_paise)}
              </TableCell>
              <TableCell>
                <StatusBadge status={c.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
