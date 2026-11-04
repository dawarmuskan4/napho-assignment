import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { formatRupees, type Claim } from "@/lib/api";

export default function ClaimTable({ claims, showEmployee }: { claims: Claim[]; showEmployee: boolean }) {
  if (claims.length === 0) return <p className="text-gray-500">No claims here.</p>;

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-gray-300">
          <th className="py-2">Title</th>
          {showEmployee && <th>Employee</th>}
          <th>Category</th>
          <th>Date</th>
          <th>Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {claims.map((c) => (
          <tr key={c.id} className="border-b border-gray-200">
            <td className="py-2">
              <Link href={`/claims/${c.id}`} className="text-blue-600 underline">
                {c.title}
              </Link>
            </td>
            {showEmployee && <td>{c.employee_name}</td>}
            <td className="capitalize">{c.category}</td>
            <td>{c.expense_date}</td>
            <td>
              {c.approved_amount_paise !== null && c.approved_amount_paise < c.amount_paise
                ? `${formatRupees(c.approved_amount_paise)} of ${formatRupees(c.amount_paise)}`
                : formatRupees(c.amount_paise)}
            </td>
            <td>
              <StatusBadge status={c.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
