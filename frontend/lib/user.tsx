"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearToken, getToken, setToken, type User } from "@/lib/api";

type AuthContextValue = {
  user: User | null;
  loading: boolean; // true until we know whether the stored token is still valid
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export const useUser = () => useContext(AuthContext);

// For pages that need a logged-in user: returns the user, or null while loading / redirecting to /login.
export function useRequireUser(): User | null {
  const { user, loading } = useUser();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);
  return user;
}

export function UserProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (getToken() ? api<User>("/auth/me") : Promise.resolve(null))
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const result = await api<{ token: string; user: User }>("/auth/login", { method: "POST", body: { email, password } });
    setToken(result.token);
    setUser(result.user);
  }

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {} // log out locally even if the server can't be reached
    clearToken();
    setUser(null);
    router.push("/login");
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}
