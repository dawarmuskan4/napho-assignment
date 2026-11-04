"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useUser } from "@/lib/user";

export default function Header() {
  const { users, user, selectUser } = useUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function pick(id: number) {
    selectUser(id);
    setOpen(false);
    router.push("/");
  }

  return (
    <header className="flex items-center justify-between border-b border-gray-300 px-6 py-3">
      <Link href="/" className="text-lg font-bold">
        Reimbursements
      </Link>

      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="rounded-full bg-blue-600 px-4 py-1.5 text-sm text-white"
        >
          {user ? `${user.name} (${user.role})` : "Loading…"} {open ? "▲" : "▼"}
        </button>

        {open && (
          <ul className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded border border-gray-400 bg-background shadow-lg">
            <li className="px-3 py-2 text-xs uppercase text-gray-500">Switch user</li>
            {users.map((u) => (
              <li key={u.id}>
                <button
                  onClick={() => pick(u.id)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 ${u.id === user?.id ? "font-bold" : ""
                    }`}
                >
                  {u.name}
                  <span className="text-xs text-gray-500">{u.role}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </header>
  );
}
