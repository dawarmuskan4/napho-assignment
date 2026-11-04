"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, errorMessage, getStoredUserId, storeUserId, type User } from "@/lib/api";

type UserContextValue = {
  users: User[];
  user: User | null;
  selectUser: (id: number) => void;
  error: string;
};

const UserContext = createContext<UserContextValue>({ users: [], user: null, selectUser: () => {}, error: "" });

export const useUser = () => useContext(UserContext);

export function UserProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<User[]>("/users")
      .then((list) => {
        const chosen = list.find((u) => String(u.id) === getStoredUserId()) ?? list[0];
        if (chosen) storeUserId(chosen.id);
        setUsers(list);
        setUser(chosen ?? null);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  function selectUser(id: number) {
    const chosen = users.find((u) => u.id === id);
    if (!chosen) return;
    storeUserId(id); // before setUser, so pages that refetch send the new X-User-Id
    setUser(chosen);
  }

  return <UserContext.Provider value={{ users, user, selectUser, error }}>{children}</UserContext.Provider>;
}
