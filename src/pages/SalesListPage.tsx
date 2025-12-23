import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fmtDateTimeCO, todayStrCO } from "../lib/datetime";

/* ================= Tipos ================= */
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

type SaleStatus = "COMPLETED" | "VOIDED" | "PARTIAL_REFUND" | "REFUNDED";

type Sale = {
  id: ID;
  created_at: string;
  user_id: ID;
  status: SaleStatus;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  notes?: string | null;
  client?: string | null;
  user_name?: string | null;
};

type SaleItem = {
  id: ID;
  sale_id: ID;
  product_id: ID;
  qty: number;
  unit_price: number;
  line_discount: number;
  tax_rate: number | null;
  tax_amount: number;
  line_total: number;
  name_snapshot: string;
  category_snapshot?: string | null;
};

type Payment = {
  id: ID;
  sale_id: ID;
  method: "CASH" | "CARD" | "TRANSFER" | "OTHER" | string;
  provider?: "NEQUI" | "DAVIPLATA" | null | string;
  amount: number;
  change_given: number;
  reference?: string | null;
  created_at: string;
};

type SaleReturn = {
  id: ID;
  sale_id: ID;
  sale_item_id: ID;
  qty: number;
  refund_amount: number;
  note?: string | null;
  created_at: string;
};

type ApiOk<T> = { ok: true } & T;
type ApiErr = { ok: false; error: string; code?: string };
type ApiRes<T> = ApiOk<T> | ApiErr;

declare global {
  interface Window {
    pos: any;
  }
}

/* ================= API helpers ================= */
const API_BASE = String(process.env.REACT_APP_API_URL || "").replace(/\/$/, "");

/* Une base + path y evita /api duplicado */
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

/* Lectura robusta de JWT en storage */
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

const writeToken = (t: string) => {
  const token = normalizeToken(t);
  if (!token) return;
  localStorage.setItem("authToken", token);
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

/* Fetch JSON con Authorization (no fuerza Content-Type en GET) */
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
      return { ok: false, error: (data && data.error) || "No autorizado", code: `HTTP_${res.status}` };
    }

    if (!res.ok) {
      return { ok: false, error: (data && data.error) || `HTTP ${res.status}`, code: `HTTP_${res.status}` };
    }

    if (data && typeof data.ok === "boolean") return data as ApiRes<T>;
    return { ok: true, ...(data || {}) } as ApiOk<T>;
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e), code: "NETWORK" };
  }
}

/* Auth actual con múltiples rutas (tolera base con /api o sin /api) */
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

/* ================= Normalizadores ================= */
function normalizeSale(raw: any): Sale {
  const userObj = raw?.user || raw?.seller || null;
  const userId = raw?.user_id ?? userObj?.id ?? userObj?._id ?? raw?.userId ?? "";
  const userName = raw?.user_name ?? userObj?.name ?? userObj?.username ?? null;

  return {
    id: raw?.id ?? raw?._id ?? "",
    created_at: raw?.created_at ?? raw?.createdAt ?? "",
    user_id: userId,
    user_name: userName,
    status: String(raw?.status || "COMPLETED").toUpperCase() as SaleStatus,
    subtotal: Number(raw?.subtotal || 0),
    discount_total: Number(raw?.discount_total ?? raw?.discountTotal ?? 0),
    tax_total: Number(raw?.tax_total ?? raw?.taxTotal ?? 0),
    total: Number(raw?.total || 0),
    notes: raw?.notes ?? null,
    client: raw?.client ?? null,
  };
}

function normalizeSaleItem(raw: any, saleId: ID): SaleItem {
  return {
    id: raw?.id ?? raw?._id ?? "",
    sale_id: raw?.sale_id ?? raw?.saleId ?? saleId,
    product_id: raw?.product_id ?? raw?.productId ?? raw?.product ?? "",
    qty: Number(raw?.qty || 0),
    unit_price: Number(raw?.unit_price ?? raw?.unitPrice ?? 0),
    line_discount: Number(raw?.line_discount ?? raw?.lineDiscount ?? 0),
    tax_rate: raw?.tax_rate ?? raw?.taxRate ?? null,
    tax_amount: Number(raw?.tax_amount ?? raw?.taxAmount ?? 0),
    line_total: Number(raw?.line_total ?? raw?.lineTotal ?? 0),
    name_snapshot: String(raw?.name_snapshot ?? raw?.nameSnapshot ?? raw?.name ?? ""),
    category_snapshot: raw?.category_snapshot ?? raw?.categorySnapshot ?? null,
  };
}

function normalizePayment(raw: any, saleId: ID): Payment {
  const created_at = String(raw?.created_at ?? raw?.createdAt ?? "");
  return {
    id: raw?.id ?? raw?._id ?? "",
    sale_id: raw?.sale_id ?? raw?.saleId ?? saleId,
    method: raw?.method ?? raw?.payment_method ?? "CASH",
    provider: raw?.provider ?? raw?.transfer_provider ?? null,
    amount: Number(raw?.amount || 0),
    change_given: Number(raw?.change_given ?? raw?.changeGiven ?? 0),
    reference: raw?.reference ?? null,
    created_at,
  };
}

function normalizeReturn(raw: any, saleId: ID): SaleReturn {
  const created_at = String(raw?.created_at ?? raw?.createdAt ?? "");
  return {
    id: raw?.id ?? raw?._id ?? "",
    sale_id: raw?.sale_id ?? raw?.saleId ?? saleId,
    sale_item_id: raw?.sale_item_id ?? raw?.saleItemId ?? raw?.sale_item ?? "",
    qty: Number(raw?.qty || 0),
    refund_amount: Number(raw?.refund_amount ?? raw?.refundAmount ?? 0),
    note: raw?.note ?? null,
    created_at,
  };
}

/* ================= Formatos ================= */
const fmtDateTimeCO12 = (s: string) => {
  try {
    const re = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/;
    if (!re.test(String(s))) return fmtDateTimeCO(s as any);
    const y = s.slice(0, 4);
    const m = s.slice(5, 7);
    const d = s.slice(8, 10);
    const HH = parseInt(s.slice(11, 13), 10);
    const mm = s.slice(14, 16);
    const am = HH < 12;
    let h12 = HH % 12;
    if (h12 === 0) h12 = 12;
    return `${d}/${m}/${y} ${h12}:${mm} ${am ? "a.m." : "p.m."}`;
  } catch {
    return fmtDateTimeCO(s as any);
  }
};

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const methodLabel = (m: Payment["method"] | string, provider?: Payment["provider"] | null) => {
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

const statusLabel = (s: SaleStatus | string) => {
  switch (String(s).toUpperCase()) {
    case "COMPLETED":
      return "Completada";
    case "VOIDED":
      return "Anulada";
    case "PARTIAL_REFUND":
      return "Reembolso parcial";
    case "REFUNDED":
      return "Reembolsada";
    default:
      return String(s);
  }
};

const statusColorOf = (st: SaleStatus) =>
  st === "COMPLETED"
    ? "#166534"
    : st === "PARTIAL_REFUND"
      ? "#854d0e"
      : st === "REFUNDED"
        ? "#1e3a8a"
        : "#991b1b";

/* ================= UI theme ================= */
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
  marginBottom: 10,
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
const th: React.CSSProperties = { fontSize: 13, color: "#333", fontWeight: 700, minWidth: 0 };

const listScroll: React.CSSProperties = {
  maxHeight: 420,
  overflowY: "auto",
  overflowX: "hidden",
};

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
const leftIcon: React.CSSProperties = { position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: MUTED };
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
  width: "min(520px, 96vw)",
};

/* ================= Iconos ================= */
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

/* ================= Utils ================= */
const digitsOnly = (s: string) => (s ?? "").replace(/\D/g, "");
const itemsCols5 = "minmax(72px,.7fr) minmax(110px,.9fr) minmax(110px,.9fr) minmax(110px,.9fr) minmax(120px,1fr)";

/* CSS local */
const localCss = `
  html, body { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  .list-root { animation: pageIn 260ms ease both; }
  @keyframes pageIn { from { opacity: 0; transform: translateY(6px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }

  .cardfx { transition: transform 160ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease; }
  .cardfx:hover { transform: translateY(-1px); border-color: rgba(${YRGB},0.7) !important; box-shadow: 0 16px 34px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(${YRGB},0.16) !important; }
  .cardfx:active { transform: translateY(0) scale(0.98); border-color: rgba(${YRGB},0.9) !important; box-shadow: 0 6px 12px rgba(0,0,0,0.10), inset 0 -1px 0 rgba(${YRGB},0.28) !important; }

  .row-hover { transition: transform 140ms ease, background 140ms ease; }
  .row-hover:hover { transform: translateY(-1px); background: #fafafc; }

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

  input:focus, select:focus, button:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(${YRGB},0.18);
    border-color: rgba(${YRGB},0.65) !important;
  }

  .min0{ min-width:0; }
  .hdr-nowrap{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

  .sales-grid{
    display:grid;
    grid-template-columns:minmax(0,0.92fr) minmax(0,1.08fr);
    gap:14px; align-items:start; min-width:0;
  }
  @media (max-width:980px){ .sales-grid{ grid-template-columns:1fr; } }

  .list-grid{
    display:grid;
    grid-template-columns:
      minmax(140px,9fr)
      minmax(0,1.2fr)
      minmax(100px,7fr)
      minmax(130px,8fr);
    gap:10px; align-items:center; min-width:0;
  }
  .list-grid>*{ min-width:0; }

  @media (max-width: 560px){
    .list-grid{ grid-template-columns: 1fr; row-gap: 6px; }
    .hdr-nowrap{ white-space: normal; }
    input, select, button { font-size: 16px; }
  }

  .items5{ display:grid; grid-template-columns:${itemsCols5}; gap:10px; align-items:center; min-width:0; }
  @media (max-width: 600px){
    .items5{ grid-template-columns: 1fr 1fr; }
    .items5 > *:nth-child(1){ order:1; text-align:left; }
    .items5 > *:nth-child(2){ order:3; text-align:right; }
    .items5 > *:nth-child(3){ order:5; text-align:right; }
    .items5 > *:nth-child(4){ order:2; text-align:right; }
    .items5 > *:nth-child(5){ order:4; text-align:right; }
  }

  input[type="number"]::-webkit-outer-spin-button,
  input[type="number"]::-webkit-inner-spin-button{ -webkit-appearance:none; margin:0; }
  input[type="number"]{ -moz-appearance:textfield; }

  @media (prefers-reduced-motion: reduce){
    .list-root, .cardfx, .btn-animate, .row-hover { animation:none !important; transition:none !important; }
  }
`;

/* ================= Componente ================= */
export default function SalesListPage() {
  const navigate = useNavigate();

  /* Confirmación dentro del módulo */
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

  const [me, setMe] = useState<Me>(null);
  const [loading, setLoading] = useState(true);

  /* Filtros */
  const [q, setQ] = useState("");
  const [from, setFrom] = useState<string>(todayStrCO());
  const [to, setTo] = useState<string>(todayStrCO());
  const [status, setStatus] = useState<"" | SaleStatus>("");

  /* Listado */
  const [items, setItems] = useState<Sale[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listErr, setListErr] = useState("");

  /* Detalle */
  const [selectedId, setSelectedId] = useState<ID | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [returns, setReturns] = useState<SaleReturn[]>([]);
  const [detailErr, setDetailErr] = useState("");
  const [detailOk, setDetailOk] = useState("");
  const [doing, setDoing] = useState(false);

  /* Devoluciones */
  const [qtyReturn, setQtyReturn] = useState<Record<string, number>>({});
  const [retNote, setRetNote] = useState("");
  const [recordRefundPayment, setRecordRefundPayment] = useState(true);

  /* Usuarios */
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const isAdmin = me?.role === "admin";

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

          /* Solo redirigir si realmente es 401/403 */
          if (err.code === "HTTP_401" || err.code === "HTTP_403") {
            clearToken();
            navigate("/login", { replace: true });
            return;
          }

          /* Si es 404/network, no forzar login */
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
        if (nextMe.id && nextMe.name) {
          setUserNames((prev) => ({ ...prev, [String(nextMe.id)]: nextMe.name }));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  /* Cargar listado */
  useEffect(() => {
    if (!loading) loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, from, to, status]);

  async function loadList() {
    setListLoading(true);
    setListErr("");

    try {
      const payload: any = {
        q: q.trim() || undefined,
        start: from || undefined,
        end: to || undefined,
        status: status || undefined,
        limit: 200,
        offset: 0,
      };

      const r = await httpJSON<{ items?: any[]; rows?: any[]; data?: any[]; sales?: any[] }>(
        `/api/sales${buildQuery(payload)}`,
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
        (Array.isArray((r as any).data) && (r as any).data) ||
        (Array.isArray((r as any).sales) && (r as any).sales) ||
        [];

      const data = rawArr.map(normalizeSale);
      setItems(data);

      setUserNames((prev) => {
        const m = { ...prev };
        for (const s of data) {
          const uid = String(s.user_id ?? "");
          const nm = String(s.user_name ?? "").trim();
          if (uid && nm) m[uid] = nm;
        }
        return m;
      });
    } catch (e: any) {
      setListErr(String(e?.message || e));
      setItems([]);
    } finally {
      setListLoading(false);
    }
  }

  async function selectSale(id: ID) {
    setSelectedId(id);
    setDetailErr("");
    setDetailOk("");

    try {
      const r = await httpJSON<{ sale?: any; items?: any[]; payments?: any[]; returns?: any[] }>(
        `/api/sales/${encodeURIComponent(String(id))}`,
        { method: "GET" }
      );

      if (!r.ok || !(r as any).sale) {
        setSale(null);
        setSaleItems([]);
        setPayments([]);
        setReturns([]);

        const msg = !r.ok ? r.error : "Venta no encontrada";
        setDetailErr(msg);
        return;
      }

      const rawSale = (r as any).sale;
      const s = normalizeSale(rawSale);

      const rawItems = Array.isArray((r as any).items)
        ? (r as any).items
        : Array.isArray(rawSale?.items)
          ? rawSale.items
          : [];
      const rawPays = Array.isArray((r as any).payments)
        ? (r as any).payments
        : Array.isArray(rawSale?.payments)
          ? rawSale.payments
          : [];
      const rawRets = Array.isArray((r as any).returns)
        ? (r as any).returns
        : Array.isArray(rawSale?.returns)
          ? rawSale.returns
          : [];

      setSale(s);
      setSaleItems(rawItems.map((x: any) => normalizeSaleItem(x, s.id)));
      setPayments(rawPays.map((x: any) => normalizePayment(x, s.id)));
      setReturns(rawRets.map((x: any) => normalizeReturn(x, s.id)));
      setQtyReturn({});

      if (s.user_id && s.user_name) {
        setUserNames((prev) => ({ ...prev, [String(s.user_id)]: String(s.user_name) }));
      }
    } catch (e: any) {
      setSale(null);
      setSaleItems([]);
      setPayments([]);
      setReturns([]);
      setDetailErr(String(e?.message || e));
    }
  }

  /* Filtrado en cliente: solo búsqueda */
  const visibleItems = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return items;

    return items.filter((s) => {
      const hay = [s.client || "", s.notes || "", String(s.id || ""), statusLabel(s.status)].join(" ").toLowerCase();
      return hay.includes(ql);
    });
  }, [items, q]);

  /* Mantener seleccionada una venta válida */
  useEffect(() => {
    if (visibleItems.length === 0) {
      if (selectedId !== null) {
        setSelectedId(null);
        setSale(null);
        setSaleItems([]);
        setPayments([]);
        setReturns([]);
      }
      return;
    }

    const isVisible = selectedId != null && visibleItems.some((s) => String(s.id) === String(selectedId));
    if (!isVisible) selectSale(visibleItems[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems]);

  const returnedByItem = useMemo(() => {
    const map: Record<string, number> = {};
    for (const rr of returns) {
      const k = String(rr.sale_item_id);
      map[k] = (map[k] || 0) + rr.qty;
    }
    return map;
  }, [returns]);

  const remainingByItem = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of saleItems) {
      const k = String(it.id);
      const done = returnedByItem[k] || 0;
      map[k] = Math.max(0, it.qty - done);
    }
    return map;
  }, [saleItems, returnedByItem]);

  const itemNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const it of saleItems) m[String(it.id)] = it.name_snapshot || `#${it.product_id}`;
    return m;
  }, [saleItems]);

  const refundPreview = useMemo(() => {
    if (!saleItems.length) return { qty: 0, amount: 0 };

    let qty = 0;
    let amount = 0;

    for (const it of saleItems) {
      const k = String(it.id);
      const want = Math.min(qtyReturn[k] || 0, remainingByItem[k] || 0);
      if (want <= 0) continue;

      const unitDisc = it.line_discount > 0 ? Math.floor(it.line_discount / it.qty) : 0;
      const unitBase = Math.max(0, it.unit_price - unitDisc);
      const unitTax = it.tax_rate != null ? Math.round((unitBase * Number(it.tax_rate || 0)) / 100) : 0;
      const unitTotal = unitBase + unitTax;

      qty += want;
      amount += unitTotal * want;
    }

    return { qty, amount };
  }, [saleItems, qtyReturn, remainingByItem]);

  async function handleVoid() {
    if (!sale) return;
    if (me?.role !== "admin") {
      setDetailErr("Solo admin");
      return;
    }
    if (sale.status === "VOIDED" || sale.status === "REFUNDED") return;

    const ok = await uiConfirm({
      message: "Anular venta",
      detail: "Esto revierte el stock. No se puede facturar nuevamente esta venta.",
      confirmText: "Anular",
      cancelText: "Cancelar",
    });
    if (!ok) return;

    setDoing(true);
    setDetailErr("");
    setDetailOk("");

    try {
      const r = await httpJSON(`/api/sales/${encodeURIComponent(String(sale.id))}/void`, { method: "POST" });
      if (!r.ok) {
        setDetailErr(r.error || "No se pudo anular");
      } else {
        await selectSale(sale.id);
        setDetailOk("Venta anulada");
        setTimeout(() => setDetailOk(""), 1600);
        await loadList();
      }
    } catch (e: any) {
      setDetailErr(String(e?.message || e));
    } finally {
      setDoing(false);
    }
  }

  async function handleReturn() {
    if (!sale) return;
    if (me?.role !== "admin") {
      setDetailErr("Solo admin");
      return;
    }
    if (sale.status === "VOIDED" || sale.status === "REFUNDED") return;

    const payloadItems = saleItems
      .map((it) => {
        const k = String(it.id);
        const want = Math.min(qtyReturn[k] || 0, remainingByItem[k] || 0);
        return want > 0 ? { sale_item_id: it.id, qty: want } : null;
      })
      .filter((x): x is { sale_item_id: ID; qty: number } => !!x);

    if (payloadItems.length === 0) {
      setDetailErr("Nada para devolver");
      return;
    }

    const ok = await uiConfirm({
      message: "Confirmar devolución",
      detail: "Se registrará devolución y ajuste de stock.",
      confirmText: "Confirmar",
      cancelText: "Cancelar",
    });
    if (!ok) return;

    setDoing(true);
    setDetailErr("");
    setDetailOk("");

    try {
      const r = await httpJSON(`/api/sales/returns`, {
        method: "POST",
        body: JSON.stringify({
          sale_id: sale.id,
          items: payloadItems,
          note: retNote.trim() || undefined,
          record_refund_payment: recordRefundPayment,
        }),
      });

      if (!r.ok) {
        setDetailErr(r.error || "No se pudo devolver");
      } else {
        await selectSale(sale.id);
        setRetNote("");
        setDetailOk("Devolución registrada");
        setTimeout(() => setDetailOk(""), 1600);
        await loadList();
      }
    } catch (e: any) {
      setDetailErr(String(e?.message || e));
    } finally {
      setDoing(false);
    }
  }

  if (loading) {
    return (
      <div style={{ height: "100vh", background: BG, color: TEXT, display: "grid", placeItems: "center" }}>
        Cargando…
      </div>
    );
  }

  return (
    <div style={shell} className="list-root">
      <div style={main}>
        <div style={container}>
          <header style={header}>
            <div style={titleRow}>
              <button onClick={() => navigate("/dashboard")} style={backBtn} className="btn-animate" aria-label="Dashboard">
                <IHome />
              </button>
              <div>
                <h1 style={h1}>LISTADO DE VENTAS</h1>
                <p style={subtitle}>Detalles de ventas</p>
              </div>
            </div>
          </header>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 8,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div style={inputWithIconWrap}>
              <span style={leftIcon}>
                <ISearch />
              </span>
              <input
                placeholder="Buscar (cliente, notas)…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") loadList();
                }}
                style={inputWithIcon}
              />
            </div>

            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={input} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={input} />

            <select value={status} onChange={(e) => setStatus(e.target.value as any)} style={input}>
              <option value="">Todos</option>
              <option value="COMPLETED">Completados</option>
              <option value="PARTIAL_REFUND">Reembolso parcial</option>
              <option value="REFUNDED">Reembolsados</option>
              <option value="VOIDED">Anulados</option>
            </select>

            <button onClick={loadList} style={btnSoft} className="btn-animate">
              Buscar
            </button>
          </div>

          <div className="sales-grid">
            <div style={{ ...card, minWidth: 0 }} className="cardfx">
              <div style={sectionTitle}>Listado</div>

              <div style={{ ...rowBase, borderTop: "none", paddingTop: 8, paddingBottom: 8 }}>
                <div className="list-grid" style={th}>
                  <div className="hdr-nowrap">Fecha</div>
                  <div className="hdr-nowrap">Cliente / Notas</div>
                  <div className="hdr-nowrap" style={{ textAlign: "right" }}>
                    Total
                  </div>
                  <div className="hdr-nowrap" style={{ textAlign: "right" }}>
                    Estado
                  </div>
                </div>
              </div>

              <div style={listScroll}>
                {listLoading ? (
                  <div style={{ padding: 16, color: MUTED }}>Cargando ventas…</div>
                ) : visibleItems.length === 0 ? (
                  <div style={{ padding: 16, color: MUTED }}>Sin resultados</div>
                ) : (
                  visibleItems.map((s) => {
                    const active = selectedId != null && String(selectedId) === String(s.id);
                    const color = statusColorOf(s.status);
                    return (
                      <div
                        key={String(s.id)}
                        onClick={() => selectSale(s.id)}
                        style={{ ...rowBase, background: active ? "#fafafc" : "#fff", cursor: "pointer" }}
                        className="row-hover"
                      >
                        <div className="list-grid">
                          <div>{fmtDateTimeCO12(s.created_at)}</div>
                          <div className="min0" style={{ overflow: "hidden" }}>
                            <div style={{ fontWeight: 600, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                              {s.client || "—"}
                            </div>
                            <div style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                              {s.notes || " "}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{COP.format(s.total)}</div>
                          <div style={{ textAlign: "right" }}>
                            <span
                              style={{
                                padding: "2px 10px",
                                borderRadius: 999,
                                border: "1px solid #e5e7eb",
                                color,
                                background: "#fff",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              {statusLabel(s.status)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {listErr && <div style={{ padding: 12, color: "#b00020" }}>{listErr}</div>}
            </div>

            <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
              {!sale ? (
                <div style={{ ...card, padding: 16 }} className="cardfx">
                  Selecciona una venta para ver su detalle.
                </div>
              ) : (
                <>
                  <div style={{ ...card, minWidth: 0 }} className="cardfx">
                    <div style={sectionTitle}>Venta #{String(sale.id)}</div>
                    <div style={{ ...rowBase, borderTop: "none" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "center", minWidth: 0 }}>
                        <div style={{ color: MUTED }}>{fmtDateTimeCO12(sale.created_at)}</div>
                        <div className="min0" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          Cliente: {sale.client || "N/A"}
                        </div>
                        <div style={{ justifySelf: "end" }}>
                          <span
                            style={{
                              padding: "2px 10px",
                              borderRadius: 999,
                              border: "1px solid #e5e7eb",
                              color: statusColorOf(sale.status),
                              background: "#fff",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            {statusLabel(sale.status)}
                          </span>
                        </div>
                      </div>

                      <div style={{ marginTop: 8, color: MUTED }}>
                        Vendedor: {userNames[String(sale.user_id)] ? userNames[String(sale.user_id)] : `#${String(sale.user_id)}`} · Notas:{" "}
                        {sale.notes || "N/A"}
                      </div>
                    </div>
                  </div>

                  <div style={{ ...card, minWidth: 0 }} className="cardfx">
                    <div style={sectionTitle}>Ítems</div>

                    <div style={{ ...rowBase, borderTop: "none", paddingTop: 8, paddingBottom: 8 }}>
                      <div className="items5" style={{ ...th, gridTemplateColumns: itemsCols5 as any }}>
                        <div className="hdr-nowrap" style={{ textAlign: "left" }}>
                          Cant
                        </div>
                        <div className="hdr-nowrap" style={{ textAlign: "right" }}>
                          P. unit
                        </div>
                        <div className="hdr-nowrap" style={{ textAlign: "right" }}>
                          Desc
                        </div>
                        <div className="hdr-nowrap" style={{ textAlign: "right" }}>
                          Impuesto
                        </div>
                        <div className="hdr-nowrap" style={{ textAlign: "right" }}>
                          Total
                        </div>
                      </div>
                    </div>

                    {saleItems.map((it) => {
                      const k = String(it.id);
                      const remaining = remainingByItem[k] || 0;
                      const retQty = qtyReturn[k] || 0;

                      return (
                        <div key={String(it.id)} style={rowBase}>
                          <div
                            className="min0"
                            style={{
                              fontWeight: 700,
                              marginBottom: 6,
                              overflow: "hidden",
                              whiteSpace: "nowrap",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {it.name_snapshot || `#${it.product_id}`}
                          </div>

                          <div className="items5" style={{ gridTemplateColumns: itemsCols5 as any }}>
                            <div style={{ textAlign: "left" }}>{it.qty}</div>
                            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{COP.format(it.unit_price)}</div>
                            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{COP.format(it.line_discount || 0)}</div>
                            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{COP.format(it.tax_amount || 0)}</div>
                            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>{COP.format(it.line_total || 0)}</div>
                          </div>

                          {isAdmin && sale.status !== "VOIDED" && sale.status !== "REFUNDED" && (
                            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                <div style={{ color: MUTED }}>
                                  Devuelto: {returnedByItem[k] || 0} · Disponible para devolver: {remaining}
                                </div>

                                <button
                                  onClick={() => setQtyReturn((prev) => ({ ...prev, [k]: Math.max(0, (prev[k] || 0) - 1) }))}
                                  disabled={doing || remaining <= 0 || retQty <= 0}
                                  style={{ ...btn, padding: "8px 10px" }}
                                  className="btn-animate"
                                >
                                  -
                                </button>

                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={String(retQty)}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                    const n = Number(digitsOnly(e.currentTarget.value));
                                    const clean = Number.isFinite(n) ? Math.max(0, Math.min(remaining, n)) : 0;
                                    setQtyReturn((prev) => ({ ...prev, [k]: clean }));
                                  }}
                                  onFocus={(e) => e.currentTarget.select()}
                                  placeholder="0"
                                  title={`Máximo ${remaining}`}
                                  disabled={remaining <= 0 || doing}
                                  style={{ ...input, width: 120, textAlign: "center" }}
                                />

                                <button
                                  onClick={() => setQtyReturn((prev) => ({ ...prev, [k]: Math.min(remaining, (prev[k] || 0) + 1) }))}
                                  disabled={doing || remaining <= 0 || retQty >= remaining}
                                  style={{ ...btn, padding: "8px 10px" }}
                                  className="btn-animate"
                                >
                                  +
                                </button>

                                <div style={{ fontSize: 12, color: MUTED }}>(max {remaining})</div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ ...card, minWidth: 0 }} className="cardfx">
                    <div style={sectionTitle}>Pagos</div>
                    {payments.length === 0 ? (
                      <div style={{ padding: 16, color: MUTED }}>Sin pagos</div>
                    ) : (
                      <div style={{ padding: 12, display: "grid", gap: 6 }}>
                        {payments.map((p) => (
                          <div
                            key={String(p.id)}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr auto auto",
                              gap: 8,
                              alignItems: "center",
                              padding: "6px 0",
                              borderBottom: "1px solid #f0f1f5",
                            }}
                          >
                            <div className="min0" style={{ overflow: "hidden" }}>
                              <div style={{ fontWeight: 600 }}>{methodLabel(p.method, p.provider)}</div>
                              <div style={{ fontSize: 12, color: MUTED }}>{fmtDateTimeCO12(p.created_at)}</div>
                            </div>
                            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{COP.format(p.amount)}</div>
                            <div
                              className="min0"
                              style={{ textAlign: "right", color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                            >
                              {p.change_given ? "Cambio " + COP.format(p.change_given) : p.reference || ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {returns.length > 0 && (
                    <div style={{ ...card, minWidth: 0 }} className="cardfx">
                      <div style={sectionTitle}>Devoluciones</div>
                      <div style={{ padding: 12, display: "grid", gap: 6 }}>
                        {returns.map((r) => (
                          <div
                            key={String(r.id)}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr auto auto",
                              gap: 8,
                              alignItems: "center",
                              padding: "6px 0",
                              borderBottom: "1px solid #f0f1f5",
                            }}
                          >
                            <div className="min0" style={{ overflow: "hidden" }}>
                              <div style={{ fontWeight: 600 }}>
                                {itemNameById[String(r.sale_item_id)] || `Ítem #${String(r.sale_item_id)}`} · {r.note || "Sin nota"}
                              </div>
                              <div style={{ fontSize: 12, color: MUTED }}>{fmtDateTimeCO12(r.created_at)}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>Cantidad {r.qty}</div>
                            <div style={{ textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{COP.format(r.refund_amount)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ ...card, minWidth: 0 }} className="cardfx">
                    <div style={sectionTitle}>Totales</div>
                    <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                      <div style={{ color: MUTED }}>Subtotal</div>
                      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{COP.format(sale.subtotal)}</div>

                      <div style={{ color: MUTED }}>Descuentos</div>
                      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{COP.format(sale.discount_total)}</div>

                      <div style={{ color: MUTED }}>Impuestos</div>
                      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{COP.format(sale.tax_total)}</div>

                      <div style={{ fontWeight: 800 }}>Total</div>
                      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>{COP.format(sale.total)}</div>
                    </div>
                  </div>

                  {isAdmin && sale.status !== "VOIDED" && sale.status !== "REFUNDED" && (
                    <div style={{ ...card, minWidth: 0 }} className="cardfx">
                      <div style={sectionTitle}>Acciones</div>
                      <div style={{ padding: 12, display: "grid", gap: 8 }}>
                        <input value={retNote} onChange={(e) => setRetNote(e.target.value)} placeholder="Nota de devolución" style={input} />
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                          <input type="checkbox" checked={recordRefundPayment} onChange={(e) => setRecordRefundPayment(e.target.checked)} />
                          Registrar pago de reembolso en efectivo
                        </label>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
                          <div style={{ color: MUTED }}>
                            Devolver seleccionados: {refundPreview.qty} · {COP.format(refundPreview.amount)}
                          </div>
                          <button onClick={handleReturn} disabled={doing || refundPreview.qty === 0} style={btnSoft} className="btn-animate">
                            Devolver
                          </button>
                          <button onClick={handleVoid} disabled={doing} style={btn} className="btn-animate">
                            Anular venta
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {detailOk && (
                    <div
                      style={{
                        padding: 10,
                        color: "#166534",
                        background: "rgba(22,101,52,0.08)",
                        border: "1px solid rgba(22,101,52,0.28)",
                        borderRadius: 8,
                      }}
                    >
                      {detailOk}
                    </div>
                  )}
                  {detailErr && (
                    <div
                      style={{
                        padding: 10,
                        color: "#b00020",
                        background: "rgba(176,0,32,0.10)",
                        border: "1px solid rgba(176,0,32,0.28)",
                        borderRadius: 8,
                      }}
                    >
                      {detailErr}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {confirmState.open && (
            <div style={modalOverlay} role="dialog" aria-modal="true" onClick={() => closeConfirm(false)}>
              <div style={modalCard} className="cardfx" onClick={(e) => e.stopPropagation()}>
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
