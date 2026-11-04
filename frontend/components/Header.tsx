"use client";

import { LogOut, Receipt, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/user";

export default function Header() {
  const { user, logout } = useUser();

  return (
    <header className="flex items-center justify-between border-b bg-card px-6 py-3">
      <Link href="/" className="flex items-center gap-2 text-lg font-bold">
        <Receipt className="size-5 text-primary" />
        Reimbursements
      </Link>
      {user && (
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5">
            <UserIcon className="size-4 text-muted-foreground" />
            {user.name}
            <Badge variant="outline" className="capitalize">
              {user.role}
            </Badge>
          </span>
          <Button variant="outline" onClick={logout}>
            <LogOut />
            Log out
          </Button>
        </div>
      )}
    </header>
  );
}
