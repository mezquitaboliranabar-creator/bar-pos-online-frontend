import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fmtDateTimeCO, todayStrCO } from "../lib/datetime";

/* Tipos base */
type Role = "admin" | "vendedor";
type ID = string | number;

type Me =
  | {
      id: ID;
      username: string;
      name: string;
      role: Role;
    }
  | null;

type ExpenseMethod = "CASH" | "CARD" | "TRANSFER" | "OTHER" | string;
type ExpenseProvider = "NEQUI" | "DAVIPLATA" | null | string;
type ExpenseStatus = "ACTIVE" | "VOID" | string;

type Expense = {
  id: ID;
  created_at: string;
  created_by?: ID | null;
  method: ExpenseMethod;
  provider?: ExpenseProvider;
  amount: number;
  concept?: string | null;
  category?: string | null;
  note?: string | null;
  status: ExpenseStatus;
  user_name?: string | null;
};

type ApiOk<T> = { ok: true } & T;
type ApiErr = { ok: false; error: string; code?: string };
type ApiRes<T> = ApiOk<T> | ApiErr;

/* API base */
const API_BASE = String(process.env.REACT_APP_API_URL || "").replace(/\/$/, "");

/* Une base + path */
function joinUrl(base: string, path: string) {
  const b = String(base || "").replace(/\/+$/, "");
  const p0 = String(path || "");
  const p = p0.startsWith("/") ? p0 : `/${p0}`;

  if (!b) return p;

  if (b.endsWith("/api") && p.startsWith("/api/")) {
    return b + p.slice(4);
  }

  return b + p;
}

/* Construye querystring */
function buildQuery(obj: Record<string, any>) {
  const qs = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/* Helpers de token */
const JWT_RE = /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/;

function stripQuotes(s: string) {
  const t = String(s || "").trim();
  if (!t) return "";
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function normalizeToken(raw: any): string {
  const s0 = stripQuotes(String(raw || ""));
  if (!s0) return "";

  const s = s0.toLowerCase().startsWith("bearer ") ? s0.slice(7).trim() : s0;
  const noBearer = stripQuotes(s);

  if (JWT_RE.test(noBearer)) return noBearer;

  if (noBearer.startsWith("{") && noBearer.endsWith("}")) {
    try {
      const obj = JSON.parse(noBearer);
      const cands = [obj.token, obj.authToken, obj.accessToken, obj.jwt, obj?.data?.token];
      for (const c of cands) {
        const t = normalizeToken(c);
        if (t) return t;
      }
    } catch {
      return "";
    }
  }

  return "";
}

function scanStorageForToken(storage: Storage): string {
  const directKeys = ["authToken", "token", "accessToken", "jwt", "barpos_token", "barPosToken", "AUTH_TOKEN"];

  for (const k of directKeys) {
    const t = normalizeToken(storage.getItem(k));
    if (t) return t;
  }

  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (!k) continue;
    const v = storage.getItem(k);
    const t = normalizeToken(v);
    if (t) return t;
  }

  return "";
}

const readToken = () => {
  const t1 = scanStorageForToken(localStorage);
  if (t1) return t1;
  const t2 = scanStorageForToken(sessionStorage);
  if (t2) return t2;
  return "";
};

const clearToken = () => {
  localStorage.removeItem("authToken");
  localStorage.removeItem("token");
  localStorage.removeItem("accessToken");
  localStorage.removeItem("jwt");
  sessionStorage.removeItem("authToken");
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("accessToken");
  sessionStorage.removeItem("jwt");
};

/* Fetch JSON con Authorization */
async function httpJSON<T>(path: string, init?: RequestInit): Promise<ApiRes<T>> {
  try {
    const token = readToken();

    const headers = new Headers(init?.headers || {});
    headers.set("Accept", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init?.body != null) headers.set("Content-Type", "application/json");

    const url = joinUrl(API_BASE, path);

    const res = await fetch(url, {
      ...init,
      headers,
      cache: "no-store",
    });

    const isJson = (res.headers.get("content-type") || "").includes("application/json");
    const data = isJson ? await res.json().catch(() => null) : null;

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: (data && (data.error || data.message)) || "No autorizado", code: `HTTP_${res.status}` };
    }

    if (!res.ok) {
      return { ok: false, error: (data && (data.error || data.message)) || `HTTP ${res.status}`, code: `HTTP_${res.status}` };
    }

    if (data && typeof data.ok === "boolean") return data as ApiRes<T>;
    return { ok: true, ...(data || {}) } as ApiOk<T>;
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e), code: "NETWORK" };
  }
}

/* Auth actual */
async function authCurrentOnline(): Promise<ApiRes<{ user: any }>> {
  const paths = ["/api/auth/me", "/auth/me", "/api/auth/current", "/auth/current"];

  let last: ApiRes<{ user: any }> = { ok: false, error: "No se pudo verificar sesión", code: "UNKNOWN" };

  for (const p of paths) {
    const r = await httpJSON<{ user: any }>(p, { method: "GET" });
    last = r;

    if (r.ok) return r;

    const err = r as ApiErr;
    if (err.code === "HTTP_401" || err.code === "HTTP_403") return r;
  }

  return last;
}

/* Helpers fecha CO */
const CO_TZ = "-05:00";
const pad2 = (n: number) => String(n).padStart(2, "0");

function normTime(t: string, end: boolean) {
  const raw = String(t || "").trim();
  const parts = raw.split(":");
  let H = Number(parts[0]);
  let M = Number(parts[1]);

  if (!Number.isFinite(H)) H = end ? 23 : 0;
  if (!Number.isFinite(M)) M = end ? 59 : 0;

  H = Math.min(23, Math.max(0, Math.trunc(H)));
  M = Math.min(59, Math.max(0, Math.trunc(M)));

  const S = end ? 59 : 0;
  return `${pad2(H)}:${pad2(M)}:${pad2(S)}`;
}

function isoCO(dateStr: string, end: boolean) {
  const d = String(dateStr || "").trim();
  if (!d) return "";
  const t = end ? normTime("23:59", true) : normTime("00:00", false);
  return `${d}T${t}${CO_TZ}`;
}

/* Normalizador */
function normalizeExpense(raw: any): Expense {
  const u = raw?.user || raw?.createdBy || raw?.created_by || null;
  const userId = raw?.created_by ?? raw?.createdBy ?? u?.id ?? u?._id ?? null;
  const userName = raw?.user_name ?? u?.name ?? u?.username ?? null;

  const st = String(raw?.status || "ACTIVE").toUpperCase();

  return {
    id: raw?.id ?? raw?._id ?? "",
    created_at: String(raw?.created_at ?? raw?.createdAt ?? raw?.date ?? ""),
    created_by: userId,
    method: String(raw?.method || "CASH").toUpperCase(),
    provider: raw?.provider ? String(raw.provider).toUpperCase() : null,
    amount: Number(raw?.amount ?? 0) || 0,
    concept: raw?.concept ?? null,
    category: raw?.category ?? null,
    note: raw?.note ?? raw?.description ?? null,
    status: st,
    user_name: userName,
  };
}

/* Formatos */
const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const fmtCOP = (n: number) => COP.format(Number(n || 0));

const methodLabel = (m: ExpenseMethod, provider?: ExpenseProvider) => {
  const mm = String(m).toUpperCase();
  if (mm === "TRANSFER") {
    const pv = String(provider || "").toUpperCase();
    if (pv === "NEQUI") return "Transferencia (Nequi)";
    if (pv === "DAVIPLATA") return "Transferencia (Daviplata)";
    return "Transferencia";
  }
  switch (mm) {
    case "CASH":
      return "Efectivo";
    case "CARD":
      return "Tarjeta";
    case "OTHER":
      return "Otro";
    default:
      return String(m);
  }
};

const statusLabel = (s: ExpenseStatus) => {
  const st = String(s).toUpperCase();
  if (st === "ACTIVE") return "Activo";
  if (st === "VOID") return "Anulado";
  return String(s);
};

const statusColorOf = (st: ExpenseStatus) => {
  const s = String(st).toUpperCase();
  if (s === "ACTIVE") return "#166534";
  if (s === "VOID") return "#991b1b";
  return "#374151";
};

/* Formato fecha/hora con a. m. / p. m. */
const fmtDateTimeCOAmPm = (input: string) => {
  const s = String(input || "").trim();
  if (!s) return "";

  const reSql = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/;

  let d: Date | null = null;

  if (reSql.test(s)) {
    const iso = `${s.replace(" ", "T")}${CO_TZ}`;
    const dd = new Date(iso);
    if (!Number.isNaN(dd.getTime())) d = dd;
  } else {
    const dd = new Date(s);
    if (!Number.isNaN(dd.getTime())) d = dd;
  }

  if (!d) {
    try {
      return fmtDateTimeCO(s as any);
    } catch {
      return s;
    }
  }

  try {
    const out = d.toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return out.replace(",", "");
  } catch {
    return fmtDateTimeCO(s as any);
  }
};

/* UI theme */
const YRGB = "244,194,43";
const BG = "#f7f8fb";
const TEXT = "#222831";
const MUTED = "#6b7280";
const RADIUS = 14;

const shell: React.CSSProperties = { minHeight: "100vh", background: BG, color: TEXT, display: "flex" };
const main: React.CSSProperties = { flex: 1, display: "flex", justifyContent: "center", overflowX: "hidden" };
const container: React.CSSProperties = { width: "min(1120px, 96vw)", padding: "18px 18px 28px" };

const header: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
  flexWrap: "wrap",
};

const titleRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10 };
const backBtn: React.CSSProperties = {
  width: 44,
  height: 44,
  display: "grid",
  placeItems: "center",
  borderRadius: 12,
  background: "#fff",
  border: `1px solid rgba(${YRGB},0.6)`,
  color: "#111",
  cursor: "pointer",
  transition: "transform 160ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease",
};

const h1: React.CSSProperties = { margin: 0, fontSize: 28, fontWeight: 800 };
const subtitle: React.CSSProperties = { margin: 0, color: MUTED };

const card: React.CSSProperties = {
  borderRadius: RADIUS,
  background: "rgba(255,255,255,0.66)",
  border: `1px solid rgba(${YRGB},0.42)`,
  boxShadow: "0 12px 30px rgba(0,0,0,0.04), inset 0 -1px 0 rgba(244,194,43,0.10)",
  overflow: "hidden",
  backdropFilter: "saturate(160%) blur(6px)",
  WebkitBackdropFilter: "saturate(160%) blur(6px)",
};

const sectionTitle: React.CSSProperties = {
  padding: "12px 16px",
  fontWeight: 800,
  background: "#fafafc",
  borderBottom: "1px solid #eef0f4",
};

const rowBase: React.CSSProperties = { padding: "12px 16px", borderTop: "1px solid #f0f1f5" };

const inputBase: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "10px 12px",
  borderRadius: 12,
  background: "#fff",
  border: "1px solid #e5e7eb",
  outline: "none",
  minWidth: 0,
  boxSizing: "border-box",
};
const input = inputBase;

const inputWithIconWrap: React.CSSProperties = { position: "relative", minWidth: 0 };
const leftIcon: React.CSSProperties = {
  position: "absolute",
  left: 10,
  top: "50%",
  transform: "translateY(-50%)",
  color: MUTED,
};
const inputWithIcon: React.CSSProperties = { ...input, paddingLeft: 36 };

const btn: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#fff",
  cursor: "pointer",
  transition: "transform 160ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease",
};

const btnSoft: React.CSSProperties = {
  ...btn,
  borderColor: `rgba(${YRGB},0.45)`,
  background: `linear-gradient(180deg, rgba(${YRGB},0.16), rgba(${YRGB},0.10))`,
  color: "#3a3200",
  fontWeight: 600,
};

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.26)",
  display: "grid",
  placeItems: "center",
  padding: 16,
  zIndex: 9999,
};

const modalCard: React.CSSProperties = {
  ...card,
  width: "min(860px, 96vw)",
};

const listScroll: React.CSSProperties = {
  maxHeight: 520,
  overflowY: "auto",
  overflowX: "hidden",
};

/* Iconos */
const IHome = (p: any) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <path d="M3 11 12 3l9 8" />
    <path d="M5 10v11h14V10" />
    <path d="M9 21v-6h6v6" />
  </svg>
);

const ISearch = (p: any) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IPlus = (p: any) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

const IList = (p: any) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <path d="M8 6h13" />
    <path d="M8 12h13" />
    <path d="M8 18h13" />
    <path d="M3 6h.01" />
    <path d="M3 12h.01" />
    <path d="M3 18h.01" />
  </svg>
);

/* Utils */
const digitsOnly = (s: string) => (s ?? "").replace(/\D/g, "");

function clampMoney(v: string) {
  const n = Number(digitsOnly(v));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(999999999, Math.trunc(n));
}

const localCss = `
  html, body { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  .page-root { animation: pageIn 260ms ease both; }
  @keyframes pageIn { from { opacity: 0; transform: translateY(6px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }

  .cardfx { transition: transform 160ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease; }
  .cardfx:hover { transform: translateY(-1px); border-color: rgba(${YRGB},0.7) !important; box-shadow: 0 16px 34px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(${YRGB},0.16) !important; }
  .cardfx:active { transform: translateY(0) scale(0.98); border-color: rgba(${YRGB},0.9) !important; box-shadow: 0 6px 12px rgba(0,0,0,0.10), inset 0 -1px 0 rgba(${YRGB},0.28) !important; }

  .btn-animate:hover {
    transform: translateY(-1px);
    border-color: rgba(${YRGB},0.7) !important;
    box-shadow: 0 10px 20px rgba(${YRGB},0.12), inset 0 -1px 0 rgba(${YRGB},0.22);
    background: linear-gradient(180deg, #ffffff, rgba(255,255,255,0.9));
  }
  .btn-animate:active {
    transform: translateY(0) scale(0.98);
    border-color: rgba(${YRGB},0.9) !important;
    box-shadow: 0 6px 12px rgba(0,0,0,0.10), inset 0 -1px 0 rgba(${YRGB},0.28);
  }

  input:focus, select:focus, textarea:focus, button:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(${YRGB},0.18);
    border-color: rgba(${YRGB},0.65) !important;
  }

  .min0 { min-width: 0; }
  .hdr-nowrap { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .grid-top {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
    gap: 12px;
    align-items: start;
  }
  @media (max-width: 980px) {
    .grid-top { grid-template-columns: 1fr; }
  }

  /* Ajuste de columnas para que el detalle tenga más espacio */
  .list-grid {
    display: grid;
    grid-template-columns:
      minmax(140px, 1.05fr)
      minmax(280px, 2.6fr)
      minmax(140px, 1.15fr)
      minmax(140px, 1.15fr);
    gap: 12px;
    align-items: center;
    min-width: 0;
  }
  .list-grid > * { min-width: 0; }

  @media (max-width: 620px) {
    .list-grid { grid-template-columns: 1fr; row-gap: 6px; }
    .hdr-nowrap { white-space: normal; }
    input, select, textarea, button { font-size: 16px; }
  }

  textarea { resize: vertical; }

  @media (prefers-reduced-motion: reduce){
    .page-root, .cardfx, .btn-animate { animation:none !important; transition:none !important; }
  }
`;

/* Página */
export default function ExpensesPage() {
  const navigate = useNavigate();

  /* Confirmación interna */
  const confirmResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    message: string;
    detail?: string;
    confirmText: string;
    cancelText: string;
  }>({
    open: false,
    message: "",
    detail: "",
    confirmText: "Confirmar",
    cancelText: "Cancelar",
  });


  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const uiConfirm = async (opts: { message: string; detail?: string; confirmText?: string; cancelText?: string }) => {
    try {
      const r = await (window as any).pos?.uiConfirm?.({ message: opts.message, detail: opts.detail });
      if (typeof r?.ok === "boolean") return r.ok;
    } catch {
      /* no-op */
    }

    return await new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmState({
        open: true,
        message: opts.message,
        detail: opts.detail || "",
        confirmText: opts.confirmText || "Confirmar",
        cancelText: opts.cancelText || "Cancelar",
      });
    });
  };

  const closeConfirm = (ans: boolean) => {
    setConfirmState((s) => ({ ...s, open: false }));
    const fn = confirmResolveRef.current;
    confirmResolveRef.current = null;
    if (fn) fn(ans);
  };

  useEffect(() => {
    if (!confirmState.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeConfirm(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmState.open]);

  /* Viewport fijo */
  useEffect(() => {
    const desired = "width=device-width, initial-scale=1, viewport-fit=cover";
    let tag = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
    if (!tag) {
      tag = document.createElement("meta");
      tag.name = "viewport";
      document.head.appendChild(tag);
    }
    if (tag.content !== desired) tag.content = desired;
  }, []);

  const [me, setMe] = useState<Me>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = me?.role === "admin";

  /* Filtros */
  const [q, setQ] = useState("");
  const [from, setFrom] = useState<string>(todayStrCO());
  const [to, setTo] = useState<string>(todayStrCO());
  const [method, setMethod] = useState<string>("");
  const [provider, setProvider] = useState<string>("");

  /* Data */
  const [items, setItems] = useState<Expense[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listErr, setListErr] = useState("");

  /* Modal listado */
  const [openList, setOpenList] = useState(false);

  /* Modal crear */
  const [openCreate, setOpenCreate] = useState(false);
  const [cConcept, setCConcept] = useState<string>("");
  const [cAmount, setCAmount] = useState<string>("");
  const [cMethod, setCMethod] = useState<ExpenseMethod>("CASH");
  const [cProvider, setCProvider] = useState<ExpenseProvider>(null);
  const [cNote, setCNote] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string>("");

  /* Autenticación */
  useEffect(() => {
    (async () => {
      try {
        const token = readToken();
        if (!token) {
          navigate("/login", { replace: true });
          return;
        }

        const cur = await authCurrentOnline();
        if (!cur.ok || !(cur as any).user) {
          const err = cur as ApiErr;

          if (err.code === "HTTP_401" || err.code === "HTTP_403") {
            clearToken();
            navigate("/login", { replace: true });
            return;
          }

          setListErr(err.error || "Error verificando sesión");
          return;
        }

        const u = (cur as any).user;
        const nextMe: Me = {
          id: u.id ?? u._id ?? u.user_id ?? "",
          username: String(u.username || ""),
          name: String(u.name || u.username || ""),
          role: (String(u.role || "vendedor").toLowerCase() as Role) || "vendedor",
        };

        setMe(nextMe);
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  /* Cargar listado */
  useEffect(() => {
    if (!loading) loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, from, to, method, provider]);

  async function loadList() {
    setListLoading(true);
    setListErr("");

    try {
      const startIso = from ? isoCO(from, false) : "";
      const endIso = to ? isoCO(to, true) : "";

      const payload: any = {
        q: q.trim() || undefined,
        start: startIso || undefined,
        end: endIso || undefined,
        method: method || undefined,
        provider: provider || undefined,
        limit: 200,
        offset: 0,
      };

      const r = await httpJSON<{ items?: any[]; rows?: any[]; expenses?: any[]; data?: any[] }>(
        `/api/expenses${buildQuery(payload)}`,
        { method: "GET" }
      );

      if (!r.ok) {
        setItems([]);
        setListErr(r.error || "No se pudo cargar el listado");
        return;
      }

      const rawArr =
        (Array.isArray((r as any).items) && (r as any).items) ||
        (Array.isArray((r as any).rows) && (r as any).rows) ||
        (Array.isArray((r as any).expenses) && (r as any).expenses) ||
        (Array.isArray((r as any).data) && (r as any).data) ||
        [];

      const data = rawArr.map(normalizeExpense);
      setItems(data);
    } catch (e: any) {
      setListErr(String(e?.message || e));
      setItems([]);
    } finally {
      setListLoading(false);
    }
  }

  const visibleItems = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return items;

    return items.filter((it) => {
      const hay = [
        String(it.id || ""),
        String(it.concept || ""),
        String(it.note || ""),
        methodLabel(it.method, it.provider),
        statusLabel(it.status),
        String(it.amount || 0),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(ql);
    });
  }, [items, q]);

  const activeItems = useMemo(() => visibleItems.filter((x) => String(x.status).toUpperCase() !== "VOID"), [visibleItems]);

  const kpiTotal = useMemo(() => activeItems.reduce((a, x) => a + (Number(x.amount || 0) || 0), 0), [activeItems]);
  const kpiCount = activeItems.length;

  const byMethod = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of activeItems) {
      const label = methodLabel(it.method, it.provider);
      map[label] = (map[label] || 0) + (Number(it.amount || 0) || 0);
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [activeItems]);

  function openCreateModal() {
    setCreateErr("");
    setCConcept("");
    setCAmount("");
    setCMethod("CASH");
    setCProvider(null);
    setCNote("");
    setOpenCreate(true);
  }

  async function submitCreate() {
    if (!isAdmin) {
      setCreateErr("Solo admin puede crear gastos");
      return;
    }

    const concept = String(cConcept || "").trim();
    if (!concept) {
      setCreateErr("Concepto requerido");
      return;
    }

    const amount = clampMoney(cAmount);
    if (!amount) {
      setCreateErr("Monto inválido");
      return;
    }

    const mm = String(cMethod || "").toUpperCase();
    const pv = mm === "TRANSFER" ? String(cProvider || "").toUpperCase() : "";

    if (mm === "TRANSFER" && pv !== "NEQUI" && pv !== "DAVIPLATA") {
      setCreateErr("Selecciona proveedor para transferencia");
      return;
    }

    setCreating(true);
    setCreateErr("");

    try {
      const body: any = {
        concept,
        amount,
        method: mm,
        provider: mm === "TRANSFER" ? pv : null,
        note: cNote.trim() || null,
      };

      const r = await httpJSON(`/api/expenses`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        setCreateErr(r.error || "No se pudo crear el gasto");
        return;
      }

      setOpenCreate(false);
      await loadList();
    } catch (e: any) {
      setCreateErr(String(e?.message || e));
    } finally {
      setCreating(false);
    }
  }

  async function handleOpenList() {
    setOpenList(true);
    await loadList();
  }

  async function clearFilters() {
    setQ("");
    setFrom("");
    setTo("");
    setMethod("");
    setProvider("");
    await loadList();
  }

  if (loading) {
    return (
      <div style={{ height: "100vh", background: BG, color: TEXT, display: "grid", placeItems: "center" }}>
        Cargando…
      </div>
    );
  }

  return (
    <div style={shell} className="page-root">
      <div style={main}>
        <div style={container}>
          <header style={header}>
            <div style={titleRow}>
              <button onClick={() => navigate("/dashboard")} style={backBtn} className="btn-animate" aria-label="Dashboard">
                <IHome />
              </button>
              <div>
                <h1 style={h1}>GASTOS</h1>
                <p style={subtitle}>Registro manual y listado de gastos</p>
              </div>
            </div>

            {me && (
              <div style={{ fontSize: 12, color: MUTED }}>
                Sesión: {me.name} ({me.role})
              </div>
            )}
          </header>

          <div className="grid-top">
            <div style={{ ...card, padding: 12 }} className="cardfx">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "center" }}>
                <div style={inputWithIconWrap}>
                  <span style={leftIcon}>
                    <ISearch />
                  </span>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") loadList();
                    }}
                    placeholder="Buscar (concepto, nota, método, monto)…"
                    style={inputWithIcon}
                  />
                </div>

                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={input} />
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={input} />

                <select value={method} onChange={(e) => setMethod(e.target.value)} style={input}>
                  <option value="">Todos los métodos</option>
                  <option value="CASH">Efectivo</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="OTHER">Otro</option>
                </select>

                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  style={input}
                  disabled={String(method).toUpperCase() !== "TRANSFER"}
                >
                  <option value="">Proveedor</option>
                  <option value="NEQUI">Nequi</option>
                  <option value="DAVIPLATA">Daviplata</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button onClick={() => loadList()} style={btnSoft} className="btn-animate">
                  {listLoading ? "Cargando…" : "Aplicar"}
                </button>

                <button onClick={clearFilters} style={btn} className="btn-animate">
                  Limpiar
                </button>

                <button onClick={handleOpenList} style={btn} className="btn-animate">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <IList />
                    Ver listado
                  </span>
                </button>

                {isAdmin && (
                  <button onClick={openCreateModal} style={btnSoft} className="btn-animate">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <IPlus />
                      Nuevo gasto
                    </span>
                  </button>
                )}
              </div>

              {listErr && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    color: "#b00020",
                    background: "rgba(176,0,32,0.10)",
                    border: "1px solid rgba(176,0,32,0.28)",
                    borderRadius: 8,
                  }}
                >
                  {listErr}
                </div>
              )}

              {!isAdmin && (
                <div style={{ marginTop: 10, color: MUTED, fontSize: 12 }}>
                  Nota: solo admin puede registrar gastos. El listado se mantiene disponible.
                </div>
              )}
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ ...card, padding: 12 }} className="cardfx">
                <div style={{ color: MUTED }}>Gastos (activos)</div>
                <div style={{ fontWeight: 800, fontSize: 22, fontVariantNumeric: "tabular-nums" }}>{fmtCOP(kpiTotal)}</div>
                <div style={{ marginTop: 6, color: MUTED, fontSize: 12 }}>Registros: {kpiCount}</div>
              </div>

              <div style={{ ...card }} className="cardfx">
                <div style={sectionTitle}>Resumen por método</div>
                {byMethod.length === 0 ? (
                  <div style={{ padding: 16, color: MUTED }}>Sin datos</div>
                ) : (
                  <div style={{ padding: 12, display: "grid", gap: 8 }}>
                    {byMethod.slice(0, 6).map(([k, v]) => (
                      <div
                        key={k}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: 10,
                          alignItems: "center",
                        }}
                      >
                        <div className="min0" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {k}
                        </div>
                        <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>{fmtCOP(v)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {openList && (
            <div style={modalOverlay} role="dialog" aria-modal="true" onClick={() => setOpenList(false)}>
              <div style={modalCard} className="cardfx" onClick={(e) => e.stopPropagation()}>
                <div style={sectionTitle}>Listado de gastos</div>

                <div style={{ padding: "12px 16px", borderBottom: "1px solid #eef0f4", background: "#fff" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "center" }}>
                    <div style={inputWithIconWrap}>
                      <span style={leftIcon}>
                        <ISearch />
                      </span>
                      <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") loadList();
                        }}
                        placeholder="Buscar…"
                        style={inputWithIcon}
                      />
                    </div>

                    <select value={method} onChange={(e) => setMethod(e.target.value)} style={input}>
                      <option value="">Todos los métodos</option>
                      <option value="CASH">Efectivo</option>
                      <option value="CARD">Tarjeta</option>
                      <option value="TRANSFER">Transferencia</option>
                      <option value="OTHER">Otro</option>
                    </select>

                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      style={input}
                      disabled={String(method).toUpperCase() !== "TRANSFER"}
                    >
                      <option value="">Proveedor</option>
                      <option value="NEQUI">Nequi</option>
                      <option value="DAVIPLATA">Daviplata</option>
                    </select>

                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={input} />
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={input} />
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button onClick={() => loadList()} style={btnSoft} className="btn-animate">
                      {listLoading ? "Cargando…" : "Aplicar"}
                    </button>
                    <button onClick={() => setOpenList(false)} style={btn} className="btn-animate">
                      Cerrar
                    </button>
                  </div>
                </div>

                <div style={{ ...rowBase, borderTop: "none", paddingTop: 10, paddingBottom: 10, background: "#fafafc" }}>
                  <div className="list-grid" style={{ fontSize: 13, fontWeight: 700, color: "#333" }}>
                    <div className="hdr-nowrap">Fecha</div>
                    <div className="hdr-nowrap">Detalle</div>
                    <div className="hdr-nowrap" style={{ textAlign: "right" }}>
                      Método
                    </div>
                    <div className="hdr-nowrap" style={{ textAlign: "right" }}>
                      Monto
                    </div>
                  </div>
                </div>

                <div style={listScroll}>
                  {listLoading ? (
                    <div style={{ padding: 16, color: MUTED }}>Cargando gastos…</div>
                  ) : visibleItems.length === 0 ? (
                    <div style={{ padding: 16, color: MUTED }}>Sin resultados</div>
                  ) : (
                    visibleItems.map((it) => {
                      const color = statusColorOf(it.status);
                      return (
                        <div key={String(it.id)} style={{ ...rowBase, background: "#fff" }}>
                          <div className="list-grid">
                            <div>{fmtDateTimeCOAmPm(it.created_at)}</div>

                            <div className="min0" style={{ overflow: "hidden" }}>
                              <div
                                style={{
                                  fontWeight: 800,
                                  lineHeight: 1.2,
                                  wordBreak: "break-word",
                                  whiteSpace: "normal",
                                }}
                              >
                                {it.concept ? String(it.concept) : "—"}
                              </div>

                              {it.note ? (
                                <div style={{ fontSize: 12, color: MUTED, marginTop: 4, whiteSpace: "normal", wordBreak: "break-word" }}>
                                  {String(it.note)}
                                </div>
                              ) : null}

                              <div style={{ fontSize: 12, color: MUTED, display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                                {it.user_name ? <span>Por: {it.user_name}</span> : null}
                                <span
                                  style={{
                                    padding: "1px 10px",
                                    borderRadius: 999,
                                    border: "1px solid #e5e7eb",
                                    background: "#fff",
                                    color,
                                    fontWeight: 800,
                                  }}
                                >
                                  {statusLabel(it.status)}
                                </span>
                              </div>
                            </div>

                            <div style={{ textAlign: "right", color: MUTED }}>{methodLabel(it.method, it.provider)}</div>

                            <div style={{ textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                              {fmtCOP(it.amount)}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div style={{ padding: "10px 16px", borderTop: "1px solid #eef0f4", background: "#fff", display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ color: MUTED, fontSize: 12 }}>
                    Total activos: <b style={{ color: TEXT }}>{fmtCOP(kpiTotal)}</b> · Registros: <b style={{ color: TEXT }}>{kpiCount}</b>
                  </div>
                  <button onClick={() => setOpenList(false)} style={btn} className="btn-animate">
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}

          {openCreate && (
            <div style={modalOverlay} role="dialog" aria-modal="true" onClick={() => setOpenCreate(false)}>
              <div style={{ ...modalCard, width: "min(520px, 96vw)" }} className="cardfx" onClick={(e) => e.stopPropagation()}>
                <div style={sectionTitle}>Nuevo gasto</div>

                <div style={{ padding: "12px 16px", display: "grid", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>Concepto</div>
                    <input value={cConcept} onChange={(e) => setCConcept(e.target.value)} placeholder="Ej: Compra de hielo" style={input} />
                  </div>

                  <div>
                    <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>Monto</div>
                    <input
                      value={cAmount}
                      onChange={(e) => setCAmount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitCreate();
                      }}
                      placeholder="0"
                      inputMode="numeric"
                      style={input}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>Método</div>
                      <select
                        value={String(cMethod)}
                        onChange={(e) => {
                          const mm = String(e.target.value).toUpperCase();
                          setCMethod(mm);
                          if (mm !== "TRANSFER") setCProvider(null);
                        }}
                        style={input}
                      >
                        <option value="CASH">Efectivo</option>
                        <option value="CARD">Tarjeta</option>
                        <option value="TRANSFER">Transferencia</option>
                        <option value="OTHER">Otro</option>
                      </select>
                    </div>

                    <div>
                      <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>Proveedor</div>
                      <select
                        value={String(cProvider || "")}
                        onChange={(e) => setCProvider(e.target.value ? String(e.target.value).toUpperCase() : null)}
                        style={input}
                        disabled={String(cMethod).toUpperCase() !== "TRANSFER"}
                      >
                        <option value="">Seleccionar</option>
                        <option value="NEQUI">Nequi</option>
                        <option value="DAVIPLATA">Daviplata</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>Detalle (opcional)</div>
                    <textarea
                      value={cNote}
                      onChange={(e) => setCNote(e.target.value)}
                      placeholder="Ej: Pago a proveedor, compra rápida…"
                      style={{ ...input, height: 92, paddingTop: 10 }}
                    />
                  </div>

                  {createErr && (
                    <div
                      style={{
                        padding: 10,
                        color: "#b00020",
                        background: "rgba(176,0,32,0.10)",
                        border: "1px solid rgba(176,0,32,0.28)",
                        borderRadius: 8,
                      }}
                    >
                      {createErr}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button type="button" style={btn} className="btn-animate" onClick={() => setOpenCreate(false)} disabled={creating}>
                      Cancelar
                    </button>
                    <button type="button" style={btnSoft} className="btn-animate" onClick={submitCreate} disabled={creating}>
                      {creating ? "Guardando…" : "Guardar"}
                    </button>
                  </div>

                  <div style={{ color: MUTED, fontSize: 12 }}>Solo se registra el gasto manual. No se maneja caja en este módulo.</div>
                </div>
              </div>
            </div>
          )}

          {confirmState.open && (
            <div style={modalOverlay} role="dialog" aria-modal="true" onClick={() => closeConfirm(false)}>
              <div style={{ ...card, width: "min(520px, 96vw)" }} className="cardfx" onClick={(e) => e.stopPropagation()}>
                <div style={sectionTitle}>{confirmState.message}</div>
                <div style={{ padding: "12px 16px", color: MUTED, whiteSpace: "pre-wrap" }}>{confirmState.detail || ""}</div>
                <div
                  style={{
                    padding: "12px 16px",
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                    borderTop: "1px solid #eef0f4",
                    background: "#fff",
                  }}
                >
                  <button type="button" style={btn} className="btn-animate" onClick={() => closeConfirm(false)}>
                    {confirmState.cancelText}
                  </button>
                  <button type="button" style={btnSoft} className="btn-animate" onClick={() => closeConfirm(true)}>
                    {confirmState.confirmText}
                  </button>
                </div>
              </div>
            </div>
          )}

          <style>{localCss}</style>
        </div>
      </div>
    </div>
  );
}
