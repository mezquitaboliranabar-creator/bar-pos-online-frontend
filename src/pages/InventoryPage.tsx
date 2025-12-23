import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  useCallback,
  useLayoutEffect,
} from "react";
import { useNavigate } from "react-router-dom";
import { fmtDateTimeCO, todayStrCO, fmtTimeCO } from "../lib/datetime";

/* ===== Tipos ===== */
type Role = "admin" | "vendedor";
type Me = { id: number; username: string; name: string; role: Role } | null;

type InvType = "UNIT" | "BASE" | "ACCOMP";
type Kind = "STANDARD" | "BASE" | "ACCOMP";

type Product = {
  id: number; // id local (hash)
  remote_id: string; // id real de Mongo
  name: string;
  category: string;
  price: number;
  stock: number;
  min_stock: number;
  is_active: number | boolean;
  inv_type?: InvType | null;
  measure?: string | null;
  kind?: Kind | null;
};

type ListResp = { ok: boolean; items: any[]; total?: number; error?: string };
type ReceiveResp = { ok: boolean; error?: string; invoice_total?: number };

type InvMove = {
  id: number; // id local (hash)
  remote_id: string;
  product_id: number; // id local (hash) del producto
  product_remote_id?: string;
  product_name: string;
  category: string;
  qty: number;
  note: string;
  user_id?: number;
  user_name?: string;
  type?: string | null;
  location?: string | null;
  supplier_id?: number | null;
  supplier_name?: string | null;
  invoice_number?: string | null;
  lot?: string | null;
  expiry_date?: string | null;
  unit_cost?: number | null;
  tax?: number | null;
  discount?: number | null;
  cost_total?: number | null;
  created_at: string;
};
type InvMoveWire = Record<string, any>;

type ReceiveLine = {
  product_id: number | "";
  qty: string;
  unit: string;
  unit_cost: string;
  unit_cost_unit: string;
  tax: string;
  discount: string;
  lot: string;
  expiry_date: string;
  note: string;
};

/* ===== Config API / Auth (alineado con ProductsPage) ===== */
const API_BASE = (process.env.REACT_APP_API_URL || "").replace(/\/+$/, "");

/* Token en localStorage */
function getToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("authToken") || "";
}

function setToken(token?: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem("authToken", token);
  else window.localStorage.removeItem("authToken");
}

type ApiResp<T = any> = { ok: boolean; error?: string } & T;
type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

/* Helper HTTP genérico */
async function httpJSON<T = any>(
  method: HttpMethod,
  path: string,
  body?: any,
  opts?: { auth?: boolean }
): Promise<ApiResp<T>> {
  const url = API_BASE + path;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body != null) headers["Content-Type"] = "application/json";
  if (opts?.auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      credentials: "omit",
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return {
        ok: false,
        error: `Respuesta no JSON (${res.status}) en ${path}: ${text.slice(
          0,
          160
        )}`,
      } as ApiResp<T>;
    }
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) } as ApiResp<T>;
  }
}

/* Auth actual (igual a ProductsPage) */
async function safeAuthMe(): Promise<ApiResp<{ user: Me }>> {
  return httpJSON("GET", "/api/auth/me", undefined, { auth: true });
}

/* Helper querystring */
function buildQuery(params?: Record<string, any>): string {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      qs.append(k, String(v));
    }
  }
  const str = qs.toString();
  return str ? `?${str}` : "";
}

/* ===== API inventario online ===== */
async function inventoryExportOnline(body: {
  include_inactive?: boolean;
  category?: string;
  inv_type?: InvType;
}): Promise<ListResp> {
  const res = await httpJSON<{ items?: any[]; total?: number }>(
    "POST",
    "/api/inventory/export",
    body,
    { auth: true }
  );
  if (!res.ok) {
    return {
      ok: false,
      items: [],
      total: 0,
      error: res.error || "Error al exportar inventario",
    };
  }
  const items = res.items || [];
  const total = res.total ?? items.length;
  return { ok: true, items, total };
}

async function inventoryAddStockOnline(body: {
  productId: string;
  qty: number;
  note?: string;
  location?: string;
}) {
  return httpJSON<{
    move?: any;
    product?: any;
  }>("POST", "/api/inventory/add-stock", body, { auth: true });
}

async function inventoryAdjustOnline(body: {
  productId: string;
  stock: number;
  note?: string;
  location?: string;
}) {
  return httpJSON<{
    delta?: number;
    move?: any;
    product?: any;
  }>("POST", "/api/inventory/adjust", body, { auth: true });
}

async function inventoryReceiveOnline(body: {
  items: any[];
  location?: string;
  supplierId?: number;
  supplierName?: string;
  invoiceNumber?: string;
  note?: string;
}) {
  return httpJSON<
    ReceiveResp & {
      moves?: any[];
      total?: number;
    }
  >("POST", "/api/inventory/receive", body, { auth: true });
}

async function inventoryMovesOnline(params: {
  q?: string;
  productId?: string;
  from?: string;
  to?: string;
  type?: string;
  category?: string;
  location?: string;
  inv_type?: string;
  limit?: number;
  offset?: number;
}) {
  const query = buildQuery(params);
  return httpJSON<{
    items?: any[];
    total?: number;
  }>("GET", "/api/inventory/moves" + query, undefined, { auth: true });
}

async function inventoryUpdateMoveOnline(
  moveId: string,
  body: {
    qty?: number;
    note?: string;
    location?: string;
    supplierId?: number | null;
    supplierName?: string | null;
    invoiceNumber?: string | null;
    unitCost?: number | null;
    discount?: number | null;
    tax?: number | null;
    lot?: string | null;
    expiryDate?: string | null;
    type?: string | null;
  }
) {
  return httpJSON<{
    move?: any;
    product?: any;
  }>("PUT", `/api/inventory/moves/${encodeURIComponent(moveId)}`, body, {
    auth: true,
  });
}

/* ===== Mapas y helpers ===== */
const mapKindToInvType = (k?: string | null): InvType => {
  const kk = String(k || "STANDARD").trim().toUpperCase();
  if (kk === "BASE") return "BASE";
  if (kk === "ACCOMP") return "ACCOMP";
  return "UNIT";
};
const mapInvTypeToKind = (t: InvType): Kind => {
  if (t === "BASE") return "BASE";
  if (t === "ACCOMP") return "ACCOMP";
  return "STANDARD";
};

function hashId(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  const out = Math.abs(hash);
  return out || 1;
}

function mapWireMoveToInvMove(r: InvMoveWire): InvMove {
  const remoteMoveId = String((r as any).id ?? (r as any)._id ?? "");
  const localMoveId = remoteMoveId ? hashId(remoteMoveId) : 0;

  const productObj = (r as any).product || {};
  const remoteProdId = String(
    productObj.id ??
      productObj._id ??
      (r as any).productId ??
      (r as any).product_id ??
      ""
  );
  const localProdId = remoteProdId ? hashId(remoteProdId) : 0;

  const userObj = (r as any).user || {};
  const supplierId =
    typeof (r as any).supplierId === "number"
      ? (r as any).supplierId
      : undefined;

  const supplierName =
    (r as any).supplierName ??
    (typeof (r as any).supplier === "string"
      ? (r as any).supplier
      : (r as any).supplier?.name) ??
    undefined;

  const unitCost =
    (r as any).unitCost != null
      ? Number((r as any).unitCost)
      : (r as any).unit_cost != null
      ? Number((r as any).unit_cost)
      : undefined;

  return {
    id: localMoveId,
    remote_id: remoteMoveId,
    product_id: localProdId,
    product_remote_id: remoteProdId || undefined,
    product_name: String(
      (r as any).product_name ?? productObj.name ?? "(sin nombre)"
    ),
    category: String((r as any).category ?? productObj.category ?? ""),
    qty: Number((r as any).qty) || 0,
    note: String((r as any).note ?? ""),
    user_id: undefined,
    user_name:
      (r as any).user_name ??
      userObj.name ??
      userObj.username ??
      undefined,
    type: (r as any).type ?? undefined,
    location: (r as any).location ?? undefined,
    supplier_id: supplierId,
    supplier_name: supplierName,
    invoice_number:
      (r as any).invoiceNumber ?? (r as any).invoice_number ?? undefined,
    lot: (r as any).lot ?? undefined,
    expiry_date:
      (r as any).expiryDate != null
        ? String((r as any).expiryDate).slice(0, 10)
        : (r as any).expiry_date ?? undefined,
    unit_cost: unitCost,
    tax:
      (r as any).tax != null ? Number((r as any).tax) : undefined,
    discount:
      (r as any).discount != null
        ? Number((r as any).discount)
        : undefined,
    cost_total:
      (r as any).cost_total != null
        ? Number((r as any).cost_total)
        : undefined,
    created_at: String((r as any).createdAt ?? (r as any).created_at ?? ""),
  };
}

/* ===== Estilos ===== */
const YRGB = "244,194,43";
const BG = "#f7f8fb";
const TEXT = "#222831";
const MUTED = "#6b7280";
const RADIUS = 14;
const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/* ===== Iconos ===== */
const IHome = (p: any) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <path d="M3 11 12 3l9 8" />
    <path d="M5 10v11h14V10" />
    <path d="M9 21v-6h6v6" />
  </svg>
);
const IBox = (p: any) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <path d="M3.27 6.96 12 12l8.73-5.04M12 22V12" />
  </svg>
);
const IPlus = (p: any) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const IList = (p: any) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
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
const ITag = (p: any) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    <path d="M20.59 13.41 11 3H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82Z" />
    <circle cx="7.5" cy="7.5" r="1.5" />
  </svg>
);
const ICalendar = (p: any) => (
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
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

/* ===== Estilos base layout ===== */
const shell: React.CSSProperties = {
  minHeight: "100vh",
  background: BG,
  color: TEXT,
  display: "flex",
};
const sidebar: React.CSSProperties = {
  width: 92,
  padding: "16px 10px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  position: "sticky",
  top: 0,
  alignSelf: "flex-start",
};
const sideChip = (active: boolean): React.CSSProperties => ({
  display: "grid",
  justifyItems: "center",
  alignItems: "center",
  gap: 6,
  padding: 10,
  borderRadius: 16,
  cursor: "pointer",
  userSelect: "none",
  color: active ? "#3b3b3b" : MUTED,
  background: active
    ? `linear-gradient(180deg, rgba(${YRGB},0.95), rgba(${YRGB},0.80))`
    : "#fff",
  border: `1px solid ${active ? `rgba(${YRGB},0.9)` : "#e5e7eb"}`,
  boxShadow: active
    ? `0 10px 20px rgba(${YRGB},0.30)`
    : "0 2px 8px rgba(0,0,0,0.04)",
});
const main: React.CSSProperties = {
  flex: 1,
  display: "flex",
  justifyContent: "center",
  overflow: "hidden",
};
const container: React.CSSProperties = {
  width: "min(1120px, 96vw)",
  padding: "18px 18px 28px",
};

const header: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
};
const titleRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};
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
  boxShadow: `0 6px 16px rgba(${YRGB},0.25)`,
};
const h1: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 800,
};
const subtitle: React.CSSProperties = {
  margin: 0,
  color: MUTED,
};

const card: React.CSSProperties = {
  borderRadius: RADIUS,
  background: "#fff",
  border: "1px solid #e5e7eb",
  boxShadow: "0 10px 28px rgba(0,0,0,0.05)",
  overflow: "hidden",
};
const sectionTitle: React.CSSProperties = {
  padding: "14px 16px",
  fontWeight: 800,
};
const tableHead: React.CSSProperties = {
  padding: "10px 16px",
  borderBottom: "1px solid #eef0f4",
  background: "#fafafc",
};
const rowBase: React.CSSProperties = {
  padding: "12px 16px",
  borderTop: "1px solid #f0f1f5",
};
const th: React.CSSProperties = {
  fontSize: 13,
  color: "#333",
  fontWeight: 700,
  minWidth: 0,
};
const td: React.CSSProperties = {
  fontSize: 14,
  color: "#111",
  minWidth: 0,
  wordBreak: "break-word" as any,
};

/* Inputs */
const inputBase: React.CSSProperties = {
  width: "100%",
  height: 36,
  padding: "8px 10px",
  lineHeight: "20px",
  borderRadius: 10,
  background: "#fff",
  border: "1px solid #e5e7eb",
  outline: "none",
  minWidth: 0,
  boxSizing: "border-box",
};
const input = inputBase;
const inputSm: React.CSSProperties = {
  ...inputBase,
  height: 34,
  padding: "6px 8px",
};
const labelSm: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: MUTED,
  marginBottom: 2,
};

const inputWithIconWrap: React.CSSProperties = {
  position: "relative",
  minWidth: 0,
  display: "block",
};
const leftIcon: React.CSSProperties = {
  position: "absolute",
  left: 10,
  top: "50%",
  transform: "translateY(-50%)",
  color: MUTED,
  pointerEvents: "none",
};
const rightIconBtn: React.CSSProperties = {
  position: "absolute",
  right: 8,
  top: "50%",
  transform: "translateY(-50%)",
  display: "grid",
  placeItems: "center",
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#fff",
  cursor: "pointer",
};
const inputWithIcon: React.CSSProperties = {
  ...input,
  paddingLeft: 36,
  paddingRight: 36,
};

const btn: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "#fff",
  cursor: "pointer",
};
const btnPrimary: React.CSSProperties = {
  ...btn,
  borderColor: `rgba(${YRGB},0.8)`,
  background: `linear-gradient(180deg, rgba(${YRGB},1), rgba(${YRGB},0.92))`,
  color: "#2b2323",
  fontWeight: 700,
  boxShadow: `0 8px 18px rgba(${YRGB},0.28)`,
};
const btnSoft: React.CSSProperties = {
  ...btn,
  borderColor: `rgba(${YRGB},0.45)`,
  background: `linear-gradient(180deg, rgba(${YRGB},0.16), rgba(${YRGB},0.10))`,
  color: "#3a3200",
  fontWeight: 600,
};

/* Pills */
const pill = (s: "ok" | "warn" | "bad"): React.CSSProperties => ({
  padding: "3px 9px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.3,
  color: s === "ok" ? "#2e7d32" : s === "warn" ? "#8a6d00" : "#b00020",
  background:
    s === "ok"
      ? "rgba(46,125,50,.12)"
      : s === "warn"
      ? `rgba(${YRGB},.18)`
      : "rgba(176,0,32,.10)",
  border:
    s === "ok"
      ? "1px solid rgba(46,125,50,.35)"
      : s === "warn"
      ? `1px solid rgba(${YRGB},.55)`
      : "1px solid rgba(176,0,32,.28)",
  textAlign: "center",
});

/* ==== Breakpoints ==== */
function useBreakpoints() {
  const get = () => {
    if (typeof window === "undefined")
      return { narrow: false, veryNarrow: false };
    return {
      narrow: window.matchMedia("(max-width: 1120px)").matches,
      veryNarrow: window.matchMedia("(max-width: 880px)").matches,
    };
  };
  const [state, setState] = useState(get);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mqNarrow = window.matchMedia("(max-width: 1120px)");
    const mqVery = window.matchMedia("(max-width: 880px)");
    const onChange = () =>
      setState({
        narrow: mqNarrow.matches,
        veryNarrow: mqVery.matches,
      });

    // @ts-ignore
    if (mqNarrow.addEventListener) {
      // @ts-ignore
      mqNarrow.addEventListener("change", onChange);
      // @ts-ignore
      mqVery.addEventListener("change", onChange);
      return () => {
        // @ts-ignore
        mqNarrow.removeEventListener("change", onChange);
        // @ts-ignore
        mqVery.removeEventListener("change", onChange);
      };
    } else {
      // @ts-ignore
      mqNarrow.addListener(onChange);
      // @ts-ignore
      mqVery.addListener(onChange);
      return () => {
        // @ts-ignore
        mqNarrow.removeListener(onChange);
        // @ts-ignore
        mqVery.removeListener(onChange);
      };
    }
  }, []);

  return state;
}

/* ==== Grids ==== */
const GRID_STOCK_WIDE =
  "minmax(220px,1.3fr) minmax(90px,0.6fr) minmax(160px,0.9fr) minmax(320px,1fr)";

/* Columns de movimientos reorganizadas para mejor espacio */
const GRID_MOVS_WIDE =
  "150px minmax(230px,1.6fr) minmax(90px,.5fr) minmax(130px,.7fr) minmax(200px,1fr) 100px";

/* Ajuste: lote más pequeño, más espacio vencimiento */
const GRID_RECEIVE_WIDE =
  "minmax(180px,1.4fr) minmax(60px,.5fr) minmax(80px,.6fr) minmax(90px,.7fr) minmax(60px,.6fr) minmax(60px,.6fr) minmax(70px,.6fr) minmax(90px,.7fr) minmax(170px,1.1fr) minmax(160px,1.1fr) 60px";

/* ===== Calendar helpers ===== */
function normalizeDateTimeForBackend(dtLocal: string) {
  if (!dtLocal) return dtLocal;
  const s = dtLocal.includes("T") ? dtLocal.replace("T", " ") : dtLocal;
  return s.length === 16 ? s + ":00" : s;
}
const nowStrCO = () => `${todayStrCO()} ${fmtTimeCO(new Date())}`;

/* ===== FocusKeeper ===== */
function useFocusKeeper() {
  const last = useRef<{
    id?: string;
    start?: number;
    end?: number;
  } | null>(null);

  useEffect(() => {
    function onFocusIn(e: any) {
      const t = e.target as HTMLInputElement | HTMLTextAreaElement;
      const id = (t?.dataset as any)?.focusId;
      if (!id) return;
      const start = (t as any).selectionStart ?? undefined;
      const end = (t as any).selectionEnd ?? start;
      last.current = { id, start, end };
    }
    function onInput(e: any) {
      const t = e.target as HTMLInputElement | HTMLTextAreaElement;
      const id = (t?.dataset as any)?.focusId;
      if (!id) return;
      const start = (t as any).selectionStart ?? undefined;
      const end = (t as any).selectionEnd ?? start;
      last.current = { id, start, end };
    }
    window.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("input", onInput, true);
    return () => {
      window.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("input", onInput, true);
    };
  }, []);

  useLayoutEffect(() => {
    const info = last.current;
    if (!info?.id) return;

    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body && active !== document.documentElement) {
      const activeId = active.getAttribute("data-focus-id");
      if (!activeId || activeId !== info.id) {
        return;
      }
    }

    const el = document.querySelector<HTMLElement>(
      `[data-focus-id="${info.id}"]`
    ) as any;
    if (!el) return;
    if (document.activeElement === el) return;
    try {
      el.focus();
      if (typeof info.start === "number" && "setSelectionRange" in el) {
        el.setSelectionRange(info.start, info.end ?? info.start);
      }
    } catch {}
  });
}

/* ===== Campos de fecha ===== */
type DateFieldProps = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
};

const DateField: React.FC<DateFieldProps> = ({ value, onChange, placeholder }) => {
  const hidden = React.useRef<HTMLInputElement | null>(null);

  const openPicker = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      hidden.current &&
      typeof (hidden.current as any).showPicker === "function"
    ) {
      (hidden.current as any).showPicker();
    } else {
      hidden.current?.focus();
    }
  };

  const toLocal = (s: string) => {
    if (!s) return "";
    return s.slice(0, 10);
  };

  const handleHiddenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value;
    onChange(v);
  };

  return (
    <div style={inputWithIconWrap}>
      <input
        className="fx-input"
        style={inputWithIcon}
        placeholder={placeholder || "YYYY-MM-DD"}
        value={value || ""}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
      <button
        type="button"
        style={rightIconBtn}
        onMouseDown={(e) => e.preventDefault()}
        onClick={openPicker}
        title="Elegir fecha"
      >
        <ICalendar />
      </button>
      <input
        ref={hidden}
        type="date"
        value={toLocal(value)}
        onChange={handleHiddenChange}
        style={{
          position: "absolute",
          opacity: 0,
          pointerEvents: "none",
          width: 0,
          height: 0,
        }}
      />
    </div>
  );
};

type DateTimeFieldProps = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
};
const DateTimeField: React.FC<DateTimeFieldProps> = ({
  value,
  onChange,
  placeholder,
}) => {
  const hidden = useRef<HTMLInputElement | null>(null);

  const openPicker = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (hidden.current as any)?.showPicker?.();
  };

  return (
    <div style={inputWithIconWrap}>
      <input
        className="fx-input"
        style={inputWithIcon}
        placeholder={placeholder || "YYYY-MM-DD HH:MM:SS"}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
      <button
        type="button"
        style={rightIconBtn}
        onMouseDown={(e) => e.preventDefault()}
        onClick={openPicker}
        title="Elegir fecha y hora"
      >
        <ICalendar />
      </button>
      <input
        ref={hidden}
        type="datetime-local"
        step={1}
        value={value ? value.replace(" ", "T") : ""}
        onChange={(e) =>
          onChange(normalizeDateTimeForBackend(e.currentTarget.value))
        }
        style={{
          position: "absolute",
          opacity: 0,
          pointerEvents: "none",
          width: 0,
          height: 0,
        }}
      />
    </div>
  );
};

/* ===== Unidades ===== */
function normalizeMeasure(inv: InvType, measure?: string | null): "UNIT" | "ML" | "G" {
  const m = String(measure || "").toUpperCase();
  if (inv === "BASE") return "ML";
  if (inv === "ACCOMP") {
    if (m === "ML") return "ML";
    if (m === "G") return "G";
    return "G";
  }
  return "UNIT";
}

const unitOptionsFor = (p?: Product) => {
  const inv = String(p?.inv_type || "UNIT").toUpperCase() as InvType;
  const meas = normalizeMeasure(inv, p?.measure);

  if (inv === "BASE") return ["ML", "L", "CL", "OZ", "SHOT"];
  if (inv === "ACCOMP") {
    if (meas === "ML") return ["ML", "L", "CL", "OZ", "SHOT"];
    return ["G", "KG", "LB"];
  }
  return ["UNIT"];
};
const costUnitOptionsFor = (p?: Product) => unitOptionsFor(p);

const canonicalQtyUnit = (p?: Product): "ML" | "G" | "UNIT" => {
  const inv = String(p?.inv_type || "UNIT").toUpperCase() as InvType;
  const meas = normalizeMeasure(inv, p?.measure);
  if (inv === "BASE") return "ML";
  if (inv === "ACCOMP") return meas === "ML" ? "ML" : "G";
  return "UNIT";
};

const unitLabelEs = (u: "ML" | "G" | "UNIT") => {
  if (u === "ML") return "ml";
  if (u === "G") return "g";
  return "und";
};

function convertQtyForProduct(p: Product, qty: number, unit: string): number {
  const canonical = canonicalQtyUnit(p);
  const u = String(unit || canonical).toUpperCase();

  if (qty <= 0) return 0;

  if (canonical === "UNIT") {
    return qty;
  }

  if (canonical === "ML") {
    const map: Record<string, number> = {
      ML: 1,
      L: 1000,
      CL: 10,
      OZ: 30,
      SHOT: 30,
    };
    const factor = map[u] ?? 1;
    return qty * factor;
  }

  if (canonical === "G") {
    const map: Record<string, number> = {
      G: 1,
      KG: 1000,
      LB: 454,
    };
    const factor = map[u] ?? 1;
    return qty * factor;
  }

  return qty;
}

/* ===== Row producto ===== */
type RowProps = {
  p: Product;
  canMutate: boolean;
  onAdd: (p: Product, qtyStr: string, unit?: string) => void;
  onEditStock: (p: Product) => void;
  narrow: boolean;
};
const ProductRow = memo(function ProductRow({
  p,
  canMutate,
  onAdd,
  onEditStock,
  narrow,
}: RowProps) {
  const grid = narrow ? "1fr" : GRID_STOCK_WIDE;
  const [qtyStr, setQtyStr] = useState<string>("");
  const [unit, setUnit] = useState<string>(() => canonicalQtyUnit(p));

  useEffect(() => {
    setUnit(canonicalQtyUnit(p));
  }, [p?.id, p?.inv_type, p?.measure]);

  const invT = String(p?.inv_type || "UNIT").toUpperCase() as InvType;
  const showUnitSelect = invT === "BASE" || invT === "ACCOMP";
  const units = unitOptionsFor(p);
  const onlyDigits = useCallback((s: string) => s.replace(/\D/g, ""), []);

  const stockUnit = unitLabelEs(canonicalQtyUnit(p));
  const stockDisplay = `${p.stock} ${stockUnit}`;

  return (
    <div
      className="fx-row"
      style={{
        ...rowBase,
        display: "grid",
        gridTemplateColumns: grid,
        alignItems: "center",
        gap: 10,
      }}
    >
      <div style={{ ...td, display: "flex", alignItems: "center", gap: 8 }}>
        {!narrow && (
          <span style={{ color: `rgba(${YRGB},1)` }}>
            <ITag />
          </span>
        )}
        <span>{p.name}</span>
      </div>

      {narrow ? (
        <div style={{ ...td, color: MUTED }}>
          <small>{COP.format(p.price || 0)}</small>
        </div>
      ) : (
        <div style={{ ...td, textAlign: "right" }}>{COP.format(p.price || 0)}</div>
      )}

      <div
        style={{
          ...td,
          textAlign: narrow ? "left" : "right",
          display: "flex",
          justifyContent: narrow ? "flex-start" : "flex-end",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span>{stockDisplay}</span>
        {p.min_stock > 0 && p.stock <= p.min_stock ? (
          <span style={pill("warn") as any}>Bajo</span>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: narrow ? "flex-start" : "flex-end",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          data-focus-id={`qty-${p.id}`}
          placeholder="+"
          inputMode="numeric"
          maxLength={8}
          className="fx-input"
          style={{ ...inputSm, width: 120, textAlign: "right" }}
          value={qtyStr}
          onChange={(e) => setQtyStr(onlyDigits(e.currentTarget.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd(p, qtyStr, showUnitSelect ? unit : "UNIT");
          }}
          aria-label={`Ingresar stock para ${p.name}`}
        />
        {showUnitSelect && (
          <select
            className="fx-input"
            style={{ ...inputSm, width: 110 }}
            value={unit}
            onChange={(e) => setUnit(e.currentTarget.value.toUpperCase())}
            title="Unidad"
          >
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        )}
        <button
          className="fx-btn"
          style={btnSoft}
          onClick={() => onAdd(p, qtyStr, showUnitSelect ? unit : "UNIT")}
          disabled={!canMutate}
        >
          Ingresar
        </button>
        {canMutate && (
          <button className="fx-btn" style={btn} onClick={() => onEditStock(p)}>
            Editar
          </button>
        )}
      </div>
    </div>
  );
});

/* =================== Componente principal =================== */
export default function InventoryPage() {
  useFocusKeeper();
  const navigate = useNavigate();

  const [me, setMe] = useState<Me>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const canMutate = me?.role === "admin";

  type Tab = "stock" | "ingresar" | "movs";
  const [tab, setTab] = useState<Tab>("stock");

  const [invType, setInvType] = useState<InvType>("UNIT");

  const [q, setQ] = useState("");
  const [items, setItems] = useState<Product[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [msg, setMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [location, setLocation] = useState("");

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const prodIndex = useMemo(() => {
    const m = new Map<number, Product>();
    for (const p of allProducts) m.set(p.id, p);
    return m;
  }, [allProducts]);

  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [editValue, setEditValue] = useState("");

  const [moves, setMoves] = useState<InvMove[]>([]);
  const [movesLoading, setMovesLoading] = useState(false);
  const [mQ, setMQ] = useState("");
  const [mFrom, setMFrom] = useState(() => `${todayStrCO()} 00:00:00`);
  const [mTo, setMTo] = useState(() => `${todayStrCO()} 23:59:59`);
  const [detailMove, setDetailMove] = useState<InvMove | null>(null);

  const [editMoveMode, setEditMoveMode] = useState(false);
  const [editMoveFields, setEditMoveFields] = useState<{
    qty: string;
    unit_cost: string;
    tax: string;
    discount: string;
    lot: string;
    expiry_date: string;
    note: string;
    supplier_name: string;
    invoice_number: string;
    location: string;
  } | null>(null);
  const [savingMoveEdit, setSavingMoveEdit] = useState(false);

  const [headerNote, setHeaderNote] = useState("");
  const [supplier, setSupplier] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [receivedAt, setReceivedAt] = useState(() => nowStrCO());
  const [lines, setLines] = useState<ReceiveLine[]>([
    {
      product_id: "",
      qty: "",
      unit: "",
      unit_cost: "",
      unit_cost_unit: "",
      tax: "",
      discount: "",
      lot: "",
      expiry_date: "",
      note: "",
    },
  ]);
  const [savingReceive, setSavingReceive] = useState(false);

  const { narrow, veryNarrow } = useBreakpoints();

  const GRID_STOCK = narrow ? "1fr" : GRID_STOCK_WIDE;
  const GRID_MOVS = veryNarrow
    ? "150px minmax(200px,1.4fr) minmax(80px,.5fr) minmax(110px,.7fr) minmax(170px,1fr) 90px"
    : GRID_MOVS_WIDE;
  const GRID_RECEIVE = veryNarrow
    ? "1fr"
    : narrow
    ? "minmax(140px,1.4fr) 60px 80px 100px 70px 70px 80px 95px minmax(160px,1.1fr) minmax(140px,1.1fr) 60px"
    : GRID_RECEIVE_WIDE;

  /* === Auth inicial (igual patrón que ProductsPage) === */
  useEffect(() => {
    (async () => {
      try {
        const token = getToken();
        if (!token) {
          navigate("/login", { replace: true });
          return;
        }
        const cur = await safeAuthMe();
        if (!cur.ok || !cur.user) {
          setToken(null);
          navigate("/login", { replace: true });
          return;
        }
        setMe(cur.user);
        setAuthChecked(true);
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, [navigate]);

  const loadProducts = async () => {
    setMsg("");
    setOkMsg("");
    setLoadingList(true);
    try {
      const res = await inventoryExportOnline({
        include_inactive: false,
        inv_type: invType,
      });

      if (!res?.ok || !Array.isArray(res.items)) {
        setItems([]);
        if (!res?.ok) {
          setMsg(res?.error || "No se pudo cargar inventario");
        }
        return;
      }

      const raw = res.items as any[];
      const normalized: Product[] = raw.map((p: any) => {
        const remoteId = String(p.id ?? p._id ?? "");
        const localId = remoteId ? hashId(remoteId) : 0;
        const inv_t: InvType =
          ((p?.inv_type && String(p.inv_type).toUpperCase()) as InvType) ||
          mapKindToInvType(p?.kind);
        return {
          id: localId,
          remote_id: remoteId,
          name: String(p.name ?? ""),
          category: String(p.category ?? ""),
          price: Number(p.price || 0),
          stock: Number(p.stock || 0),
          min_stock: Number(p.min_stock || 0),
          is_active: 1,
          inv_type: inv_t,
          measure: normalizeMeasure(inv_t, p?.measure),
          kind: (p.kind as Kind) ?? null,
        };
      });

      const filtered = normalized.filter(
        (p) => String(p.inv_type).toUpperCase() === invType
      );
      setItems(filtered);
    } catch (e: any) {
      setMsg(String(e || "No se pudo cargar inventario"));
    } finally {
      setLoadingList(false);
    }
  };

  const loadAllProducts = useCallback(async () => {
    try {
      const res = await inventoryExportOnline({
        include_inactive: false,
      });
      if (res?.ok && Array.isArray(res.items)) {
        const mapped: Product[] = (res.items as any[]).map((p: any) => {
          const remoteId = String(p.id ?? p._id ?? "");
          const localId = remoteId ? hashId(remoteId) : 0;
          const inv_t: InvType =
            ((p.inv_type && String(p.inv_type).toUpperCase()) as InvType) ||
            mapKindToInvType(p.kind);
          return {
            id: localId,
            remote_id: remoteId,
            name: String(p.name ?? ""),
            category: String(p.category ?? ""),
            price: Number(p.price || 0),
            stock: Number(p.stock || 0),
            min_stock: Number(p.min_stock || 0),
            is_active: 1,
            inv_type: inv_t,
            measure: normalizeMeasure(inv_t, p?.measure),
            kind: (p.kind as Kind) ?? null,
          };
        });
        setAllProducts(mapped);
      }
    } catch {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    if (tab === "ingresar") loadAllProducts();
  }, [tab, loadAllProducts]);

  useEffect(() => {
    if (detailMove && allProducts.length === 0) {
      loadAllProducts();
    }
  }, [detailMove, allProducts.length, loadAllProducts]);

  /* Carga de productos solo después de auth */
  useEffect(() => {
    if (!authChecked) return;
    if (tab === "stock") loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invType, tab, authChecked]);

  const lowItems = useMemo(
    () =>
      items.filter(
        (p) =>
          (p.is_active ?? 1) === 1 &&
          (p.min_stock || 0) > 0 &&
          p.stock <= p.min_stock
      ),
    [items]
  );

  const categorias = useMemo(() => {
    const set = new Set<string>();
    items.forEach((p) =>
      set.add((p.category || "Sin categoría").trim() || "Sin categoría")
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredGroups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const active = items
      .filter((p) => (p.is_active ?? 1) === 1)
      .filter(
        (p) =>
          !s ||
          p.name.toLowerCase().includes(s) ||
          (p.category || "").toLowerCase().includes(s)
      )
      .filter(
        (p) =>
          !categoryFilter ||
          (p.category || "").toLowerCase() === categoryFilter.toLowerCase()
      )
      .sort(
        (a, b) =>
          (a.category || "").localeCompare(b.category || "") ||
          a.name.localeCompare(b.name)
      );
    const g: Record<string, Product[]> = {};
    for (const p of active) {
      const key = (p.category || "Sin categoría").trim() || "Sin categoría";
      (g[key] ||= []).push(p);
    }
    return g;
  }, [items, q, categoryFilter]);

  const flashOk = (text: string, ms = 2200) => {
    setOkMsg(text);
    window.setTimeout(() => setOkMsg(""), ms);
  };

  const addStock = async (p: Product, qtyStr: string, unit?: string) => {
    if (!canMutate) {
      setMsg("Solo un administrador puede ingresar stock.");
      return;
    }
    const rawQty = Math.max(0, parseInt(qtyStr || "0", 10) || 0);
    if (rawQty <= 0) {
      setMsg("Ingresa una cantidad válida (> 0).");
      return;
    }
    const canonicalUnit = canonicalQtyUnit(p);
    const u = (unit || canonicalUnit || "UNIT").toUpperCase();
    const qtyCanonical = convertQtyForProduct(p, rawQty, u);
    if (qtyCanonical <= 0) {
      setMsg("Ingresa una cantidad válida (> 0).");
      return;
    }

    try {
      const resp = await inventoryAddStockOnline({
        productId: p.remote_id,
        qty: qtyCanonical,
        note: "Ingreso rápido de inventario",
        location: location || undefined,
      });
      if (resp?.ok) {
        setItems((prev) =>
          prev.map((x) =>
            x.id === p.id ? { ...x, stock: x.stock + qtyCanonical } : x
          )
        );
        setAllProducts((prev) =>
          prev.map((x) =>
            x.id === p.id ? { ...x, stock: x.stock + qtyCanonical } : x
          )
        );
        flashOk(
          `Stock actualizado (+${qtyCanonical} ${unitLabelEs(
            canonicalUnit as any
          )})`
        );
      } else {
        setMsg(resp?.error || "No fue posible ingresar stock");
      }
    } catch (e: any) {
      setMsg(String(e));
    }
  };

  const openEditStock = (p: Product) => {
    setEditTarget(p);
    setEditValue(String(Math.max(0, p.stock || 0)));
    setMsg("");
    setOkMsg("");
  };

  const submitEditStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || !canMutate) return;
    const target = Math.max(0, parseInt(editValue || "0", 10) || 0);
    try {
      const r = await inventoryAdjustOnline({
        productId: editTarget.remote_id,
        stock: target,
        note: "Edición de stock (valor absoluto)",
        location: location || undefined,
      });
      if (r?.ok) {
        setItems((prev) =>
          prev.map((x) => (x.id === editTarget.id ? { ...x, stock: target } : x))
        );
        setAllProducts((prev) =>
          prev.map((x) => (x.id === editTarget.id ? { ...x, stock: target } : x))
        );
        setEditTarget(null);
        flashOk("Stock actualizado");
      } else setMsg((r as any)?.error || "No fue posible editar el stock");
    } catch (err: any) {
      setMsg(String(err));
    }
  };

  const loadMoves = async () => {
    setMovesLoading(true);
    setMsg("");
    try {
      const res = await inventoryMovesOnline({
        q: mQ || undefined,
        from: mFrom ? normalizeDateTimeForBackend(mFrom) : undefined,
        to: mTo ? normalizeDateTimeForBackend(mTo) : undefined,
        type: "IN",
        limit: 300,
      });
      if (res?.ok && Array.isArray(res.items)) {
        let parsed: InvMove[] = (res.items as InvMoveWire[]).map(
          mapWireMoveToInvMove
        );

        const qStr = mQ.trim().toLowerCase();
        if (qStr) {
          parsed = parsed.filter((mv) => {
            return (
              mv.product_name.toLowerCase().includes(qStr) ||
              (mv.category || "").toLowerCase().includes(qStr) ||
              (mv.note || "").toLowerCase().includes(qStr) ||
              (mv.invoice_number || "").toLowerCase().includes(qStr) ||
              (mv.supplier_name || "").toLowerCase().includes(qStr)
            );
          });
        }

        setMoves(parsed);
      } else {
        setMoves([]);
        if (!res?.ok) {
          setMsg(res?.error || "No se pudieron cargar los movimientos");
        }
      }
    } catch (e: any) {
      setMsg(String(e));
    } finally {
      setMovesLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "movs" && authChecked) {
      loadMoves();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, authChecked]);

  const exportStock = async () => {
    try {
      const res = await inventoryExportOnline({
        include_inactive: false,
        inv_type: invType,
      });
      if (!res?.ok || !Array.isArray(res.items)) {
        setMsg(res?.error || "No fue posible exportar");
        return;
      }
      const rows = res.items as any[];
      if (!rows.length) {
        flashOk("No hay datos para exportar");
        return;
      }
      const header = [
        "Nombre",
        "Categoría",
        "Stock",
        "MinStock",
        "Precio",
        "Tipo",
        "TipoInv",
        "Medida",
      ];
      const csvLines = [
        header.join(";"),
        ...rows.map((p) =>
          [
            `"${(p.name ?? "").toString().replace(/"/g, '""')}"`,
            `"${(p.category ?? "").toString().replace(/"/g, '""')}"`,
            Number(p.stock ?? 0),
            Number(p.min_stock ?? 0),
            Number(p.price ?? 0),
            p.kind ?? "",
            p.inv_type ?? "",
            p.measure ?? "",
          ].join(";")
        ),
      ];
      const blob = new Blob([csvLines.join("\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const now = new Date();
      const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(now.getDate()).padStart(2, "0")}`;
      a.href = url;
      a.download = `inventario_${invType}_${ts}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      flashOk("Stock exportado");
    } catch (e: any) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const onlyDigits = (s: string) => s.replace(/\D/g, "");
  const keepDecimal = (s: string) =>
    String(s ?? "")
      .replace(/[^\d.,\-]/g, "")
      .replace(",", ".");
  const parseAmountNumber = (s?: string) => {
    if (!s) return undefined;
    const cleaned = String(s).replace(/[^\d.\-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  };

  const computeLineTotal = (l: ReceiveLine): number => {
    const qty = Math.max(0, parseInt(l.qty || "0", 10) || 0);
    const unit = Number(l.unit_cost || "0") || 0;
    const tax = parseAmountNumber(l.tax) || 0;
    const disc = parseAmountNumber(l.discount) || 0;
    return unit * qty - disc + tax;
  };
  const formTotal = useMemo(
    () => lines.reduce((acc, l) => acc + computeLineTotal(l), 0),
    [lines]
  );

  const formProfitTotal = useMemo(() => {
    let total = 0;
    for (const l of lines) {
      const pid = Number(l.product_id) || 0;
      if (!pid) continue;
      const prod = prodIndex.get(pid);
      if (!prod) continue;
      const priceSale = Number(prod.price || 0);
      if (!(priceSale > 0)) continue;
      const unitCostNum = parseAmountNumber(l.unit_cost);
      if (unitCostNum == null) continue;
      const qty = Math.max(0, parseInt(l.qty || "0", 10) || 0);
      if (!(qty > 0)) continue;
      const marginUnit = priceSale - unitCostNum;
      if (!Number.isFinite(marginUnit)) continue;
      total += marginUnit * qty;
    }
    return total;
  }, [lines, prodIndex]);

  const detailInvoiceSummary = useMemo(() => {
    if (!detailMove) return null;

    const invoiceKey = (detailMove.invoice_number || "").trim();
    let base: InvMove[] = [];

    if (invoiceKey) {
      const related = moves.filter(
        (mv) => (mv.invoice_number || "").trim() === invoiceKey
      );
      if (related.length > 0) {
        base = related;
      }
    }

    if (base.length === 0) {
      base = [detailMove];
    }

    let total = 0;
    let profit = 0;

    for (const mv of base) {
      const lineTotal =
        mv.cost_total != null
          ? Number(mv.cost_total) || 0
          : mv.unit_cost != null
          ? (Number(mv.unit_cost) || 0) * (mv.qty || 0)
          : 0;
      total += lineTotal;

      const prod = prodIndex.get(mv.product_id);
      if (prod && typeof prod.price === "number" && mv.unit_cost != null) {
        const marginUnit = Number(prod.price) - Number(mv.unit_cost);
        if (Number.isFinite(marginUnit)) {
          profit += marginUnit * (mv.qty || 0);
        }
      }
    }

    return { total, profit };
  }, [detailMove, moves, prodIndex]);

  const updateLine = (idx: number, patch: Partial<ReceiveLine>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      {
        product_id: "",
        qty: "",
        unit: "",
        unit_cost: "",
        unit_cost_unit: "",
        tax: "",
        discount: "",
        lot: "",
        expiry_date: "",
        note: "",
      },
    ]);

  const removeLine = (idx: number) =>
    setLines((prev) => prev.filter((_, i) => i !== idx));

  const onChangeProductInLine = (idx: number, productIdStr: string) => {
    const pid = Number(productIdStr) || 0;
    const prod = prodIndex.get(pid);
    const defQty = canonicalQtyUnit(prod);
    updateLine(idx, {
      product_id: pid || "",
      unit: pid ? defQty : "",
      unit_cost_unit: pid ? defQty : "",
    });
  };

  const submitReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMutate) {
      setMsg("Solo un administrador puede ingresar mercancía.");
      return;
    }
    setMsg("");
    setOkMsg("");

    const prepared: ReceiveLine[] = lines.map((l) => {
      const pid = Number(l.product_id) || 0;
      const prod = prodIndex.get(pid);
      const defQty = canonicalQtyUnit(prod);
      return {
        ...l,
        product_id: pid || "",
        unit: (l.unit || "").toUpperCase() || (pid ? defQty : ""),
        unit_cost_unit:
          (l.unit_cost_unit || "").toUpperCase() || (pid ? defQty : ""),
      };
    });

    for (let i = 0; i < prepared.length; i++) {
      const l = prepared[i];
      const pid = Number(l.product_id) || 0;
      const qty = Math.max(0, parseInt(l.qty || "0", 10) || 0);
      if (!pid || qty <= 0) continue;

      const prod = prodIndex.get(pid);
      const qtyUnits = unitOptionsFor(prod);
      const costUnits = costUnitOptionsFor(prod);

      if (!l.unit || !qtyUnits.includes(l.unit)) {
        setMsg(
          `Línea ${i + 1}: selecciona unidad válida (${qtyUnits.join(", ")}).`
        );
        return;
      }
      if (!l.unit_cost_unit || !costUnits.includes(l.unit_cost_unit)) {
        setMsg(
          `Línea ${
            i + 1
          }: selecciona unidad de costo válida (${costUnits.join(", ")}).`
        );
        return;
      }
    }

    const itemsPayload: {
      productId: string;
      qty: number;
      unitCost?: number;
      discount?: number;
      tax?: number;
      lot?: string;
      expiryDate?: string;
      note?: string;
    }[] = [];

    for (const l of prepared) {
      const pid = Number(l.product_id) || 0;
      const qty = Math.max(0, parseInt(l.qty || "0", 10) || 0);
      if (!pid || qty <= 0) continue;

      const prod = prodIndex.get(pid);
      if (!prod?.remote_id) continue;

      const unitCostNum = parseAmountNumber(l.unit_cost);
      const discountNum = parseAmountNumber(l.discount);
      const taxNum = parseAmountNumber(l.tax);

      itemsPayload.push({
        productId: prod.remote_id,
        qty,
        unitCost: unitCostNum,
        discount: discountNum,
        tax: taxNum,
        lot: l.lot?.trim() || undefined,
        expiryDate: l.expiry_date?.trim() || undefined,
        note: l.note?.trim() || undefined,
      });
    }

    if (!itemsPayload.length) {
      setMsg("Agrega al menos una línea válida.");
      return;
    }

    setSavingReceive(true);
    try {
      const supplierStr = supplier.trim();
      const supplierId = /^\d+$/.test(supplierStr)
        ? Number(supplierStr)
        : undefined;
      const supplierName = supplierId ? undefined : supplierStr || undefined;

      const payload = {
        items: itemsPayload,
        location: location?.trim() || undefined,
        supplierId,
        supplierName,
        invoiceNumber: invoiceNumber.trim() || undefined,
        note: headerNote.trim() || undefined,
      };

      const r = await inventoryReceiveOnline(payload);
      if (r?.ok) {
        const msgTotal =
          r.invoice_total != null
            ? ` (Total: ${COP.format(r.invoice_total)})`
            : "";
        flashOk("Ingreso registrado" + msgTotal);
        setHeaderNote("");
        setSupplier("");
        setInvoiceNumber("");
        setReceivedAt(nowStrCO());
        setLines([
          {
            product_id: "",
            qty: "",
            unit: "",
            unit_cost: "",
            unit_cost_unit: "",
            tax: "",
            discount: "",
            lot: "",
            expiry_date: "",
            note: "",
          },
        ]);
        await Promise.all([loadProducts(), loadAllProducts()]);
        setTab("movs");
      } else setMsg((r as any)?.error || "No fue posible registrar el ingreso");
    } catch (err: any) {
      setMsg(String(err));
    } finally {
      setSavingReceive(false);
    }
  };

  const prefillFromMoves = (base: InvMove[]) => {
    if (!base.length) return;
    const first = base[0];

    setTab("ingresar");
    setSupplier(first.supplier_name || "");
    setInvoiceNumber(first.invoice_number || "");
    setLocation(first.location || "");
    setHeaderNote(first.note || "");

    const newLines: ReceiveLine[] = base.map((mv) => {
      const prod = prodIndex.get(mv.product_id);
      const defUnit = canonicalQtyUnit(prod);
      return {
        product_id: mv.product_id || "",
        qty: mv.qty != null ? String(mv.qty) : "",
        unit: defUnit,
        unit_cost: mv.unit_cost != null ? String(mv.unit_cost) : "",
        unit_cost_unit: defUnit,
        tax: mv.tax != null ? String(mv.tax) : "",
        discount: mv.discount != null ? String(mv.discount) : "",
        lot: mv.lot || "",
        expiry_date: mv.expiry_date || "",
        note: mv.note || "",
      };
    });

    setLines(newLines);
    setDetailMove(null);
    setEditMoveMode(false);
    setEditMoveFields(null);
  };

  const handleEditMovementFromDetail = () => {
    if (!detailMove) return;
    setEditMoveMode(true);
    setEditMoveFields({
      qty: detailMove.qty != null ? String(detailMove.qty) : "",
      unit_cost:
        detailMove.unit_cost != null ? String(detailMove.unit_cost) : "",
      tax: detailMove.tax != null ? String(detailMove.tax) : "",
      discount:
        detailMove.discount != null ? String(detailMove.discount) : "",
      lot: detailMove.lot || "",
      expiry_date: detailMove.expiry_date || "",
      note: detailMove.note || "",
      supplier_name: detailMove.supplier_name || "",
      invoice_number: detailMove.invoice_number || "",
      location: detailMove.location || "",
    });
  };

  const handleEditInvoiceFromDetail = () => {
    if (!detailMove) return;
    setEditMoveMode(false);
    setEditMoveFields(null);
    const key = (detailMove.invoice_number || "").trim();
    let base: InvMove[];
    if (key) {
      const related = moves.filter(
        (mv) => (mv.invoice_number || "").trim() === key
      );
      base = related.length ? related : [detailMove];
    } else {
      base = [detailMove];
    }
    prefillFromMoves(base);
  };

  const submitEditMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailMove || !editMoveFields) return;
    if (!canMutate) {
      setMsg("Solo un administrador puede editar movimientos.");
      return;
    }
    setMsg("");
    setOkMsg("");

    const qtyNum = Math.max(
      0,
      parseInt(onlyDigits(editMoveFields.qty || "0"), 10) || 0
    );
    if (!(qtyNum > 0)) {
      setMsg("Ingresa una cantidad válida para el movimiento.");
      return;
    }

    const unitCostNum = parseAmountNumber(editMoveFields.unit_cost);
    const taxNum = parseAmountNumber(editMoveFields.tax);
    const discountNum = parseAmountNumber(editMoveFields.discount);

    const payload: {
  qty: number;
  note?: string;
  location?: string;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  lot?: string | null;
  expiryDate?: string | null;
  unitCost?: number | null;
  tax?: number | null;
  discount?: number | null;
} = {
  qty: qtyNum,
  note: editMoveFields.note || "",
  // enviamos string o undefined, nunca null
  location: editMoveFields.location || undefined,
  supplierName: editMoveFields.supplier_name || null,
  invoiceNumber: editMoveFields.invoice_number || null,
  lot: editMoveFields.lot || null,
  expiryDate: editMoveFields.expiry_date || null,
};


    if (unitCostNum != null) payload.unitCost = unitCostNum;
    if (taxNum != null) payload.tax = taxNum;
    if (discountNum != null) payload.discount = discountNum;

    setSavingMoveEdit(true);
    try {
      const r = await inventoryUpdateMoveOnline(detailMove.remote_id, payload);
      if (!r.ok || !r.move) {
        setMsg(r.error || "No fue posible editar el movimiento");
        return;
      }

      const updated = mapWireMoveToInvMove(r.move as any);

      setMoves((prev) =>
        prev.map((m) =>
          m.remote_id === updated.remote_id ? updated : m
        )
      );
      setDetailMove(updated);

      if (r.product) {
        const remoteProdId = String(
          (r.product as any).id ?? (r.product as any)._id ?? ""
        );
        const localProdId = remoteProdId ? hashId(remoteProdId) : 0;
        const newStock = Number((r.product as any).stock || 0);
        setItems((prev) =>
          prev.map((p) =>
            p.id === localProdId ? { ...p, stock: newStock } : p
          )
        );
        setAllProducts((prev) =>
          prev.map((p) =>
            p.id === localProdId ? { ...p, stock: newStock } : p
          )
        );
      }

      flashOk("Movimiento actualizado");
      setEditMoveMode(false);
      setEditMoveFields(null);
    } catch (err: any) {
      setMsg(String(err));
    } finally {
      setSavingMoveEdit(false);
    }
  };

  const openDetailMove = (mv: InvMove) => {
    setDetailMove(mv);
    setEditMoveMode(false);
    setEditMoveFields(null);
    setSavingMoveEdit(false);
  };

  /* ==== Vistas ==== */
  const renderStockView = () => (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Filtros superiores */}
      <div className="fx-card" style={{ ...card, padding: 14 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div style={inputWithIconWrap}>
            <span style={leftIcon}>
              <ISearch />
            </span>
            <input
              className="fx-input"
              style={inputWithIcon}
              placeholder="Buscar por nombre o categoría"
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
            />
          </div>

          <select
            className="fx-input"
            style={input}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.currentTarget.value)}
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            className="fx-input"
            style={input}
            value={invType}
            onChange={(e) => setInvType(e.currentTarget.value as InvType)}
          >
            <option value="UNIT">Unidad</option>
            <option value="BASE">Bebidas base</option>
            <option value="ACCOMP">Acompañamientos</option>
          </select>

          <input
            className="fx-input"
            style={input}
            placeholder="Ubicación opcional (barra, bodega...)"
            value={location}
            onChange={(e) => setLocation(e.currentTarget.value)}
          />

          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <button
              className="fx-btn"
              style={btn}
              onClick={() => {
                setQ("");
                setCategoryFilter("");
                loadProducts();
              }}
            >
              Limpiar
            </button>
            <button
              className="fx-btn"
              style={btn}
              onClick={() => loadProducts()}
            >
              Recargar
            </button>
            <button
              className="fx-btn"
              style={btnPrimary}
              onClick={exportStock}
            >
              Exportar CSV
            </button>
          </div>
        </div>
      </div>

      {/* Resumen bajo stock */}
      <div className="fx-card" style={card}>
        <div
          style={{
            ...sectionTitle,
            borderBottom: "1px solid #eef0f4",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Resumen de stock</span>
          <span style={{ fontSize: 12, color: MUTED }}>
            Bajo stock: {lowItems.length}
          </span>
        </div>
        {lowItems.length === 0 ? (
          <div style={{ padding: 12, fontSize: 13, color: MUTED }}>
            No hay productos con stock bajo.
          </div>
        ) : (
          <div style={{ padding: 10, display: "grid", gap: 6 }}>
            {lowItems.slice(0, 8).map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 13,
                }}
              >
                <span>
                  {p.name}{" "}
                  <span style={{ color: MUTED, fontSize: 12 }}>
                    ({p.category || "Sin categoría"})
                  </span>
                </span>
                <span>
                  {p.stock} / {p.min_stock}
                </span>
              </div>
            ))}
            {lowItems.length > 8 && (
              <div style={{ fontSize: 12, color: MUTED }}>
                (+{lowItems.length - 8} más)
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabla stock */}
      <div className="fx-card" style={{ ...card, overflow: "hidden" }}>
        <div
          style={{
            ...sectionTitle,
            borderBottom: "1px solid #eef0f4",
          }}
        >
          Stock actual
        </div>
        <div style={tableHead}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: GRID_STOCK,
              gap: 10,
              alignItems: "center",
            }}
          >
            <div style={th}>Producto</div>
            <div style={{ ...th, textAlign: "right" }}>Precio</div>
            <div style={{ ...th, textAlign: "right" }}>Stock</div>
            <div style={{ ...th, textAlign: "right" }}>Ingreso rápido</div>
          </div>
        </div>

        <div
          style={{
            maxHeight: 440,
            overflowY: "auto",
          }}
        >
          {loadingList ? (
            <div style={{ padding: 16 }}>Cargando inventario…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 16 }}>No hay productos para este tipo.</div>
          ) : (
            Object.entries(filteredGroups).map(([cat, arr]) => (
              <div key={cat}>
                <div
                  style={{
                    padding: "6px 16px",
                    fontSize: 12,
                    fontWeight: 700,
                    color: MUTED,
                    background: "#f9fafb",
                    borderTop: "1px solid #eef0f4",
                  }}
                >
                  {cat}
                </div>
                {arr.map((p) => (
                  <ProductRow
                    key={p.id}
                    p={p}
                    canMutate={!!canMutate}
                    onAdd={addStock}
                    onEditStock={openEditStock}
                    narrow={narrow}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  const renderIngresarView = () => (
    <form onSubmit={submitReceive} style={{ display: "grid", gap: 14 }}>
      {/* Cabecera ingreso */}
      <div className="fx-card" style={{ ...card, padding: 14 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <div>
            <label style={labelSm}>Proveedor / referencia</label>
            <input
              className="fx-input"
              style={input}
              value={supplier}
              onChange={(e) => setSupplier(e.currentTarget.value)}
              placeholder="Nombre o NIT"
            />
          </div>
          <div>
            <label style={labelSm}>Número de factura</label>
            <input
              className="fx-input"
              style={input}
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.currentTarget.value)}
              placeholder="Opcional"
            />
          </div>
          <div>
            <label style={labelSm}>Ubicación</label>
            <input
              className="fx-input"
              style={input}
              value={location}
              onChange={(e) => setLocation(e.currentTarget.value)}
              placeholder="Bodega, barra, nevera…"
            />
          </div>
          <div>
            <label style={labelSm}>Fecha/hora ingreso</label>
            <DateTimeField
              value={receivedAt}
              onChange={setReceivedAt}
              placeholder="YYYY-MM-DD HH:MM:SS"
            />
            <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>
              El backend usa la fecha actual; este campo es solo de referencia.
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <label style={labelSm}>Nota general</label>
          <textarea
            className="fx-input"
            style={{ ...input, minHeight: 60, resize: "vertical" }}
            value={headerNote}
            onChange={(e) => setHeaderNote(e.currentTarget.value)}
            placeholder="Detalle del ingreso, número de guía, etc."
          />
        </div>
      </div>

      {/* Líneas */}
      <div className="fx-card" style={card}>
        <div
          style={{
            ...sectionTitle,
            borderBottom: "1px solid #eef0f4",
          }}
        >
          Líneas de ingreso
        </div>
        <div style={tableHead}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: GRID_RECEIVE,
              gap: 8,
              alignItems: "center",
            }}
          >
            <div style={th}>Producto</div>
            <div style={th}>Cant.</div>
            <div style={th}>Unidad</div>
            <div style={th}>Precio de compra por unidad</div>
            <div style={th}>U. costo</div>
            <div style={th}>Impto</div>
            <div style={th}>Desc.</div>
            <div style={th}>Lote</div>
            <div style={th}>Vencimiento</div>
            <div style={th}>Nota</div>
            <div style={{ ...th, textAlign: "center" }}>Acción</div>
          </div>
        </div>
        <div
          style={{
            maxHeight: 360,
            overflowY: "auto",
          }}
        >
          {lines.map((l, idx) => {
            const pid = Number(l.product_id) || 0;
            const prod = prodIndex.get(pid);
            const qtyUnits = unitOptionsFor(prod);
            const costUnits = costUnitOptionsFor(prod);
            const lineTotal = computeLineTotal(l);

            return (
              <div
                key={idx}
                className="fx-row"
                style={{
                  ...rowBase,
                  display: "grid",
                  gridTemplateColumns: GRID_RECEIVE,
                  gap: 8,
                  alignItems: "center",
                }}
              >
                {/* Producto */}
                <div>
                  <select
                    className="fx-input"
                    style={inputSm}
                    value={l.product_id || ""}
                    onChange={(e) =>
                      onChangeProductInLine(idx, e.currentTarget.value)
                    }
                  >
                    <option value="">Seleccionar…</option>
                    {Array.from(prodIndex.values()).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.category || "Sin categoría"})
                      </option>
                    ))}
                  </select>
                  {prod && (
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                      Venta: {COP.format(prod.price || 0)}
                    </div>
                  )}
                </div>

                {/* Cantidad */}
                <div>
                  <input
                    className="fx-input"
                    style={{ ...inputSm, textAlign: "right" }}
                    value={l.qty}
                    onChange={(e) =>
                      updateLine(idx, { qty: onlyDigits(e.currentTarget.value) })
                    }
                    inputMode="numeric"
                    placeholder="0"
                  />
                </div>

                {/* Unidad cantidad */}
                <div>
                  <select
                    className="fx-input"
                    style={inputSm}
                    value={l.unit}
                    onChange={(e) =>
                      updateLine(idx, { unit: e.currentTarget.value.toUpperCase() })
                    }
                    disabled={!prod}
                  >
                    <option value="">-</option>
                    {qtyUnits.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Costo unitario */}
                <div>
                  <input
                    className="fx-input"
                    style={{ ...inputSm, textAlign: "right" }}
                    value={l.unit_cost}
                    onChange={(e) =>
                      updateLine(idx, {
                        unit_cost: keepDecimal(e.currentTarget.value),
                      })
                    }
                    inputMode="decimal"
                    placeholder="0"
                  />
                </div>

                {/* Unidad costo */}
                <div>
                  <select
                    className="fx-input"
                    style={inputSm}
                    value={l.unit_cost_unit}
                    onChange={(e) =>
                      updateLine(idx, {
                        unit_cost_unit: e.currentTarget.value.toUpperCase(),
                      })
                    }
                    disabled={!prod}
                  >
                    <option value="">-</option>
                    {costUnits.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Impuesto */}
                <div>
                  <input
                    className="fx-input"
                    style={{ ...inputSm, textAlign: "right" }}
                    value={l.tax}
                    onChange={(e) =>
                      updateLine(idx, { tax: keepDecimal(e.currentTarget.value) })
                    }
                    inputMode="decimal"
                    placeholder="0"
                  />
                </div>

                {/* Descuento */}
                <div>
                  <input
                    className="fx-input"
                    style={{ ...inputSm, textAlign: "right" }}
                    value={l.discount}
                    onChange={(e) =>
                      updateLine(idx, {
                        discount: keepDecimal(e.currentTarget.value),
                      })
                    }
                    inputMode="decimal"
                    placeholder="0"
                  />
                </div>

                {/* Lote */}
                <div>
                  <input
                    className="fx-input"
                    style={inputSm}
                    value={l.lot}
                    onChange={(e) => updateLine(idx, { lot: e.currentTarget.value })}
                    placeholder="Opcional"
                  />
                </div>

                {/* Vencimiento */}
                <div>
                  <DateField
                    value={l.expiry_date}
                    onChange={(v) => updateLine(idx, { expiry_date: v })}
                    placeholder="YYYY-MM-DD"
                  />
                </div>

                {/* Nota */}
                <div>
                  <input
                    className="fx-input"
                    style={inputSm}
                    value={l.note}
                    onChange={(e) =>
                      updateLine(idx, { note: e.currentTarget.value })
                    }
                    placeholder="Observación"
                  />
                  {lineTotal > 0 && (
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                      Total línea: {COP.format(lineTotal)}
                    </div>
                  )}
                </div>

                {/* Acción */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <button
                    type="button"
                    className="fx-btn"
                    style={btn}
                    onClick={() => removeLine(idx)}
                    disabled={lines.length === 1}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer líneas */}
        <div
          style={{
            padding: 12,
            borderTop: "1px solid #eef0f4",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className="fx-btn"
            style={btnSoft}
            onClick={addLine}
          >
            Añadir línea
          </button>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              textAlign: "right",
              fontSize: 13,
            }}
          >
            <span>
              Total factura: <b>{COP.format(formTotal || 0)}</b>
            </span>
            <span style={{ color: MUTED }}>
              Ganancia potencial:{" "}
              <b>{COP.format(Math.max(0, Math.round(formProfitTotal || 0)))}</b>
            </span>
          </div>
        </div>
      </div>

      {/* Botones guardar */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className="fx-btn"
          style={btn}
          onClick={() => {
            setHeaderNote("");
            setSupplier("");
            setInvoiceNumber("");
            setLines([
              {
                product_id: "",
                qty: "",
                unit: "",
                unit_cost: "",
                unit_cost_unit: "",
                tax: "",
                discount: "",
                lot: "",
                expiry_date: "",
                note: "",
              },
            ]);
          }}
        >
          Limpiar formulario
        </button>
        <button
          type="submit"
          className="fx-btn"
          style={btnPrimary}
          disabled={savingReceive || !canMutate}
        >
          {savingReceive ? "Guardando…" : "Registrar ingreso"}
        </button>
      </div>
    </form>
  );

  const renderMovsView = () => (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Filtros movimientos */}
      <div className="fx-card" style={{ ...card, padding: 14 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: 12,
          }}
        >
          <div style={inputWithIconWrap}>
            <span style={leftIcon}>
              <ISearch />
            </span>
            <input
              className="fx-input"
              style={inputWithIcon}
              placeholder="Buscar por producto, proveedor, nota, factura…"
              value={mQ}
              onChange={(e) => setMQ(e.currentTarget.value)}
            />
          </div>
          <div>
            <label style={labelSm}>Desde</label>
            <DateTimeField value={mFrom} onChange={setMFrom} />
          </div>
          <div>
            <label style={labelSm}>Hasta</label>
            <DateTimeField value={mTo} onChange={setMTo} />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "flex-end",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <button
              className="fx-btn"
              style={btn}
              type="button"
              onClick={() => {
                const today = todayStrCO();
                setMFrom(`${today} 00:00:00`);
                setMTo(`${today} 23:59:59`);
                setMQ("");
                loadMoves();
              }}
            >
              Hoy
            </button>
            <button
              className="fx-btn"
              style={btnPrimary}
              type="button"
              onClick={loadMoves}
            >
              Aplicar filtros
            </button>
          </div>
        </div>
      </div>

      {/* Tabla movimientos */}
      <div className="fx-card" style={card}>
        <div
          style={{
            ...sectionTitle,
            borderBottom: "1px solid #eef0f4",
          }}
        >
          Ingresos registrados
        </div>
        <div style={tableHead}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: GRID_MOVS,
              gap: 12,
              alignItems: "center",
            }}
          >
            <div style={th}>Fecha</div>
            <div style={th}>Producto</div>
            <div style={{ ...th, textAlign: "right" }}>Cantidad</div>
            <div style={{ ...th, textAlign: "right" }}>Costo total</div>
            <div style={th}>Proveedor / factura</div>
            <div style={{ ...th, textAlign: "center" }}>Detalle</div>
          </div>
        </div>
        <div
          style={{
            maxHeight: 430,
            overflowY: "auto",
          }}
        >
          {movesLoading ? (
            <div style={{ padding: 16 }}>Cargando movimientos…</div>
          ) : moves.length === 0 ? (
            <div style={{ padding: 16 }}>No hay movimientos para este rango.</div>
          ) : (
            moves.map((mv, i) => (
              <div
                key={mv.id}
                className="fx-row"
                style={{
                  ...rowBase,
                  display: "grid",
                  gridTemplateColumns: GRID_MOVS,
                  gap: 12,
                  alignItems: "center",
                  cursor: "pointer",
                  animationDelay: `${i * 0.01}s`,
                }}
                onClick={() => openDetailMove(mv)}
              >
                <div style={{ ...td, fontSize: 13 }}>
                  {fmtDateTimeCO(mv.created_at)}
                </div>
                <div style={td}>
                  <div>{mv.product_name}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>
                    {mv.category || "Sin categoría"}
                  </div>
                </div>
                <div style={{ ...td, textAlign: "right" }}>{mv.qty}</div>
                <div style={{ ...td, textAlign: "right" }}>
                  {mv.cost_total != null
                    ? COP.format(mv.cost_total || 0)
                    : "-"}
                </div>
                <div style={td}>
                  <div>{mv.supplier_name || "Sin proveedor"}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>
                    {mv.invoice_number || "Sin factura"}
                  </div>
                </div>
                <div style={{ ...td, textAlign: "center" }}>
                  <button
                    type="button"
                    className="fx-btn"
                    style={btn}
                    onClick={(e) => {
                      e.stopPropagation();
                      openDetailMove(mv);
                    }}
                  >
                    Ver
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  /* ===== Render principal + modales ===== */
  return (
    <div style={shell}>
      <aside className="fx-card" style={sidebar}>
        <div
          className="fx-chip"
          style={sideChip(tab === "stock")}
          onClick={() => setTab("stock")}
          title="Stock"
        >
          <IBox />
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Stock
          </div>
        </div>
        <div
          className="fx-chip"
          style={sideChip(tab === "ingresar")}
          onClick={() => setTab("ingresar")}
          title="Ingresar mercancía"
        >
          <IPlus />
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Ingresar
          </div>
        </div>
        <div
          className="fx-chip"
          style={sideChip(tab === "movs")}
          onClick={() => setTab("movs")}
          title="Movimientos"
        >
          <IList />
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Movimientos
          </div>
        </div>
      </aside>

      <div style={main}>
        <div style={container} className="fx-main">
          <header className="fx-card" style={header}>
            <div style={titleRow}>
              <button
                className="fx-btn"
                style={backBtn}
                onClick={() => navigate("/dashboard")}
                aria-label="Volver al dashboard"
              >
                <IHome />
              </button>
              <div>
                <h1 style={h1}>INVENTARIO</h1>
                <p style={subtitle}>Unidad • Bebidas base • Acompañamientos</p>
              </div>
            </div>
            <div />
          </header>

          {/* mensajes */}
          {msg && (
            <div
              className="fx-card"
              style={{
                ...card,
                padding: 10,
                marginBottom: 10,
                borderColor: "rgba(176,0,32,.35)",
                background: "rgba(176,0,32,.06)",
                color: "#7f0814",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <span>{msg}</span>
                <button
                  className="fx-btn"
                  style={{ ...btn, padding: "4px 8px" }}
                  onClick={() => setMsg("")}
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}
          {okMsg && (
            <div
              className="fx-card"
              style={{
                ...card,
                padding: 10,
                marginBottom: 10,
                borderColor: "rgba(46,125,50,.45)",
                background: "rgba(46,125,50,.06)",
                color: "#255d2b",
              }}
            >
              {okMsg}
            </div>
          )}

          {/* contenido según pestaña */}
          {tab === "stock" && renderStockView()}
          {tab === "ingresar" && renderIngresarView()}
          {tab === "movs" && renderMovsView()}

          {/* Modal editar stock */}
          {editTarget && (
            <div
              className="fx-backdrop"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,.35)",
                display: "grid",
                placeItems: "center",
                zIndex: 50,
              }}
              onClick={() => setEditTarget(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="fx-modal"
                style={{ ...card, width: "min(420px, 92vw)", padding: 16 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>Editar stock</h2>
                <p
                  style={{
                    fontSize: 13,
                    color: MUTED,
                    margin: "0 0 10px",
                  }}
                >
                  {editTarget.name}
                </p>
                <form
                  onSubmit={submitEditStock}
                  style={{ display: "grid", gap: 10 }}
                >
                  <div>
                    <label style={labelSm}>Stock actual</label>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {editTarget.stock}
                    </div>
                  </div>
                  <div>
                    <label style={labelSm}>Nuevo valor</label>
                    <input
                      className="fx-input"
                      style={{ ...input, textAlign: "right" }}
                      value={editValue}
                      onChange={(e) =>
                        setEditValue(onlyDigits(e.currentTarget.value))
                      }
                      inputMode="numeric"
                      placeholder="0"
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      className="fx-btn"
                      style={btn}
                      onClick={() => setEditTarget(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="fx-btn"
                      style={btnPrimary}
                      disabled={!canMutate}
                    >
                      Guardar
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: MUTED }}>
                    Se registrará un movimiento de ajuste en inventario.
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal detalle movimiento / factura */}
          {detailMove && (
            <div
              className="fx-backdrop"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,.35)",
                display: "grid",
                placeItems: "center",
                zIndex: 50,
              }}
              onClick={() => {
                setDetailMove(null);
                setEditMoveMode(false);
                setEditMoveFields(null);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="fx-modal"
                style={{ ...card, width: "min(640px, 96vw)", padding: 16 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>
                  Detalle de ingreso
                </h2>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: MUTED,
                  }}
                >
                  {fmtDateTimeCO(detailMove.created_at)} ·{" "}
                  {detailMove.location || "Sin ubicación"}
                </p>

                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 8,
                    fontSize: 13,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>Producto</div>
                    <div>{detailMove.product_name}</div>
                    <div style={{ fontSize: 12, color: MUTED }}>
                      {detailMove.category || "Sin categoría"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Proveedor</div>
                    <div>{detailMove.supplier_name || "Sin proveedor"}</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Factura</div>
                    <div>{detailMove.invoice_number || "Sin factura"}</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Lote / Venc.</div>
                    <div>
                      {detailMove.lot || "-"} ·{" "}
                      {detailMove.expiry_date || "Sin fecha"}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 10,
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                    fontSize: 13,
                    display: "grid",
                    gap: 4,
                  }}
                >
                  <div>
                    Cantidad: <b>{detailMove.qty}</b>
                  </div>
                  <div>
                    Costo unitario:{" "}
                    <b>
                      {detailMove.unit_cost != null
                        ? COP.format(detailMove.unit_cost)
                        : "N/D"}
                    </b>
                  </div>
                  <div>
                    Impuesto:{" "}
                    <b>
                      {detailMove.tax != null
                        ? COP.format(detailMove.tax)
                        : "0"}
                    </b>
                  </div>
                  <div>
                    Descuento:{" "}
                    <b>
                      {detailMove.discount != null
                        ? COP.format(detailMove.discount)
                        : "0"}
                    </b>
                  </div>
                  <div>
                    Total movimiento:{" "}
                    <b>
                      {detailMove.cost_total != null
                        ? COP.format(detailMove.cost_total)
                        : COP.format(0)}
                    </b>
                  </div>
                </div>

                {editMoveMode && editMoveFields && (
  <form
    onSubmit={submitEditMovement}
    style={{
      marginTop: 12,
      padding: 10,
      borderRadius: 10,
      background: "#fffdf5",
      border: "1px solid rgba(244,194,43,.5)",
      fontSize: 13,
      display: "grid",
      gap: 8,
    }}
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 8,
      }}
    >
      <div>
        <label style={labelSm}>Cantidad</label>
        <input
          className="fx-input"
          style={{ ...inputSm, textAlign: "right" }}
          value={editMoveFields.qty}
          onChange={(e) => {
            const v = onlyDigits(e.currentTarget.value);
            setEditMoveFields((prev) =>
              prev ? { ...prev, qty: v } : prev
            );
          }}
          inputMode="numeric"
        />
      </div>
      <div>
        <label style={labelSm}>Costo unitario</label>
        <input
          className="fx-input"
          style={{ ...inputSm, textAlign: "right" }}
          value={editMoveFields.unit_cost}
          onChange={(e) => {
            const v = keepDecimal(e.currentTarget.value);
            setEditMoveFields((prev) =>
              prev ? { ...prev, unit_cost: v } : prev
            );
          }}
          inputMode="decimal"
        />
      </div>
      <div>
        <label style={labelSm}>Impuesto</label>
        <input
          className="fx-input"
          style={{ ...inputSm, textAlign: "right" }}
          value={editMoveFields.tax}
          onChange={(e) => {
            const v = keepDecimal(e.currentTarget.value);
            setEditMoveFields((prev) =>
              prev ? { ...prev, tax: v } : prev
            );
          }}
          inputMode="decimal"
        />
      </div>
      <div>
        <label style={labelSm}>Descuento</label>
        <input
          className="fx-input"
          style={{ ...inputSm, textAlign: "right" }}
          value={editMoveFields.discount}
          onChange={(e) => {
            const v = keepDecimal(e.currentTarget.value);
            setEditMoveFields((prev) =>
              prev ? { ...prev, discount: v } : prev
            );
          }}
          inputMode="decimal"
        />
      </div>
    </div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 8,
      }}
    >
      <div>
        <label style={labelSm}>Lote</label>
        <input
          className="fx-input"
          style={inputSm}
          value={editMoveFields.lot}
          onChange={(e) => {
            const v = e.currentTarget.value;
            setEditMoveFields((prev) =>
              prev ? { ...prev, lot: v } : prev
            );
          }}
        />
      </div>
      <div>
        <label style={labelSm}>Vencimiento</label>
        <DateField
          value={editMoveFields.expiry_date}
          onChange={(v) =>
            setEditMoveFields((prev) =>
              prev ? { ...prev, expiry_date: v } : prev
            )
          }
          placeholder="YYYY-MM-DD"
        />
      </div>
      <div>
        <label style={labelSm}>Ubicación</label>
        <input
          className="fx-input"
          style={inputSm}
          value={editMoveFields.location}
          onChange={(e) => {
            const v = e.currentTarget.value;
            setEditMoveFields((prev) =>
              prev ? { ...prev, location: v } : prev
            );
          }}
        />
      </div>
    </div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 8,
      }}
    >
      <div>
        <label style={labelSm}>Proveedor</label>
        <input
          className="fx-input"
          style={inputSm}
          value={editMoveFields.supplier_name}
          onChange={(e) => {
            const v = e.currentTarget.value;
            setEditMoveFields((prev) =>
              prev ? { ...prev, supplier_name: v } : prev
            );
          }}
        />
      </div>
      <div>
        <label style={labelSm}>Factura</label>
        <input
          className="fx-input"
          style={inputSm}
          value={editMoveFields.invoice_number}
          onChange={(e) => {
            const v = e.currentTarget.value;
            setEditMoveFields((prev) =>
              prev ? { ...prev, invoice_number: v } : prev
            );
          }}
        />
      </div>
    </div>

    <div>
      <label style={labelSm}>Nota</label>
      <textarea
        className="fx-input"
        style={{ ...input, minHeight: 48, fontSize: 13 }}
        value={editMoveFields.note}
        onChange={(e) => {
          const v = e.currentTarget.value;
          setEditMoveFields((prev) =>
            prev ? { ...prev, note: v } : prev
          );
        }}
      />
    </div>

    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        gap: 8,
        flexWrap: "wrap",
        marginTop: 4,
      }}
    >
      <button
        type="button"
        className="fx-btn"
        style={btn}
        onClick={() => {
          setEditMoveMode(false);
          setEditMoveFields(null);
        }}
      >
        Cancelar edición
      </button>
      <button
        type="submit"
        className="fx-btn"
        style={btnPrimary}
        disabled={savingMoveEdit || !canMutate}
      >
        {savingMoveEdit ? "Guardando…" : "Guardar cambios"}
      </button>
    </div>
  </form>
)}


                {detailInvoiceSummary && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 10,
                      borderRadius: 10,
                      background: "rgba(244,194,43,.06)",
                      border: "1px solid rgba(244,194,43,.45)",
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                      Resumen de factura
                    </div>
                    <div>
                      Total factura:{" "}
                      <b>{COP.format(detailInvoiceSummary.total || 0)}</b>
                    </div>
                    <div>
                      Ganancia potencial:{" "}
                      <b>
                        {COP.format(
                          Math.max(
                            0,
                            Math.round(detailInvoiceSummary.profit || 0)
                          )
                        )}
                      </b>
                    </div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>
                      Calculado sobre el precio de venta actual de los
                      productos.
                    </div>
                  </div>
                )}

                {detailMove.note && !editMoveMode && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 10,
                      borderRadius: 10,
                      background: "#f9fafb",
                      border: "1px solid #e5e7eb",
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Nota</div>
                    <div>{detailMove.note}</div>
                  </div>
                )}

                <div
                  style={{
                    marginTop: 14,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      className="fx-btn"
                      style={btn}
                      onClick={handleEditMovementFromDetail}
                    >
                      Editar movimiento
                    </button>
                    {detailMove.invoice_number && (
                      <button
                        type="button"
                        className="fx-btn"
                        style={btnSoft}
                        onClick={handleEditInvoiceFromDetail}
                      >
                        Editar factura
                      </button>
                    )}
                  </div>
                  <button
                    className="fx-btn"
                    style={btn}
                    onClick={() => {
                      setDetailMove(null);
                      setEditMoveMode(false);
                      setEditMoveFields(null);
                    }}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Animaciones / microinteracciones */}
      <style>{`
        :root { --yr:${YRGB}; }
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(.98) translateY(6px) } to { opacity: 1; transform: none } }
        @keyframes backdropIn { from { opacity: 0 } to { opacity: 1 } }

        @media (prefers-reduced-motion: reduce) {
          .fx-card, .fx-row, .fx-modal, .fx-backdrop { animation: none !important; }
          .fx-btn, .fx-input { transition: none !important; }
        }

        .fx-card { animation: fadeSlideUp .45s cubic-bezier(.2,.65,.2,1) both; }
        .fx-row  { animation: fadeSlideUp .35s ease both; }
        .fx-modal { animation: scaleIn .26s ease both; }
        .fx-backdrop { animation: backdropIn .18s ease both; }

        .fx-btn { transition: transform .1s ease, box-shadow .2s ease, background .2s ease, border-color .2s ease; }
        .fx-btn:active { transform: translateY(1px) scale(.98); }

        .fx-input { transition: box-shadow .18s ease, border-color .18s ease; }
        .fx-input:focus {
          border-color: rgba(${YRGB}, .65) !important;
          box-shadow: 0 0 0 3px rgba(${YRGB}, .22);
        }

        .fx-row:hover { background: rgba(0,0,0,.02); }

        @media (max-width: 880px) {
          .fx-btn { padding: 10px 14px; }
          .fx-input { height: 40px; }
        }
      `}</style>
    </div>
  );
}
