export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Role = "employee" | "approver";
export type Status = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "PAID";
export const CATEGORIES = ["travel", "food", "lodging", "supplies", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export type User = { id: number; name: string; email: string; role: Role };

export type ClaimEvent = {
  id: number;
  action: string;
  actor_id: number;
  actor_name: string;
  actor_role: Role;
  from_status: Status | null;
  to_status: Status;
  amount_paise: number;
  approved_amount_paise: number | null;
  comment: string | null;
  created_at: string;
};

export type Claim = {
  id: number;
  employee_id: number;
  employee_name: string;
  title: string;
  category: Category;
  description: string | null;
  expense_date: string;
  amount_paise: number;
  approved_amount_paise: number | null;
  status: Status;
  created_at: string;
  updated_at: string;
};

export type ClaimDetail = Claim & { events: ClaimEvent[] };

// ---- login session ----
// The token lives in sessionStorage: it survives a reload but is private to this tab,
// so two tabs can be logged in as two different people.

const TOKEN_KEY = "token";

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function clearToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
}

// ---- fetch wrapper ----

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// FastAPI sends {detail: "text"} for our errors and {detail: [{loc, msg}, ...]} for validation errors
function readableDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => `${String(d.loc?.slice(1).join(".") ?? "")}: ${String(d.msg ?? "")}`.replace(/^: /, ""))
      .join("; ");
  }
  return "Something went wrong";
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

export async function api<T = void>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, `Cannot reach the server at ${API_URL}. Is the backend running?`);
  }

  if (res.status === 401 && !path.startsWith("/auth/")) {
    clearToken(); // session expired or invalid
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload on purpose: drops all stale state
    window.location.href = "/login";
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, readableDetail(data?.detail));
  return data as T;
}

// ---- money: the API only speaks integer paise ----

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0 });

export function formatRupees(paise: number): string {
  return inr.format(paise / 100);
}

export function rupeesToPaise(rupees: string): number {
  return Math.round(Number(rupees) * 100);
}

export function paiseToRupees(paise: number): string {
  return String(paise / 100);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
