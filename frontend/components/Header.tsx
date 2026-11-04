"use client";

import Link from "next/link";
import { useUser } from "@/lib/user";

export default function Header() {
  const { users, user, selectUser } = useUser();

  return (
    <header className="flex items-center justify-between border-b border-gray-300 px-6 py-3">
      <Link href="/" className="text-lg font-bold">
        Reimbursements
      </Link>
      <label className="flex items-center gap-2 text-sm">
        Acting as
        <select
          className="rounded border border-gray-400 bg-transparent px-2 py-1"
          value={user?.id ?? ""}
          onChange={(e) => selectUser(Number(e.target.value))}
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.role})
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}
