import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { todayStrCO, daysAgoStrCO } from "../lib/datetime";

/* ===== Tipos ===== */
type Role = "admin" | "vendedor";
type Me = { id: string; username: string; name: string; role: Role } | null;

type SaleRow = {
  id: string;
  created_at: string;
  user_id: string;
  status: "COMPLETED" | "VOIDED" | "PARTIAL_REFUND" | "REFUNDED";
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  client?: string | null;
};

type Payment = {
  id: string;
  sale_id: string;
  method: "CASH" | "CARD" | "TRANSFER" | "OTHER";
  provider?: "NEQUI" | "DAVIPLATA" | null;
  amount: number;
  change_given: number;
  reference?: string | null;
  created_at: string;
};

type SaleItem = {
  id: string;
  sale_id: string;
  product_id: string;
  qty: number;
  unit_price: number;
  line_discount: number;
  tax_rate: number | null;
  tax_amount: number;
  line_total: number;
  name_snapshot: string;
  category_snapshot?: string | null;
};

type TopProduct = {
  name: string;
  qty: number;
  amount: number;
  category?: string | null;
};

/* ===== Token ===== */
function getToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("authToken") || "";
}

function setToken(token?: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem("authToken", token);
  else window.localStorage.removeItem("authToken");
}

/* ===== API online ===== */
const API_URL = (process.env.REACT_APP_API_URL || "").replace(/\/+$/, "");

function apiJoin(path: string) {
  if (!API_URL) return path;
  if (path.startsWith("http")) return path;
  return `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/* Request JSON con Bearer token */
async function apiGetJson(path: string, params?: Record<string, string | undefined>) {
  const url = new URL(apiJoin(path), window.location.origin);

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v != null && String(v).trim() !== "") url.searchParams.set(k, String(v));
    }
  }

  const token = getToken();
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    if (res.status === 401) setToken(null);
    const msg = data?.error || data?.message || `Error HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

function pickId(v: any) {
  return String(v?.id || v?._id || "");
}

function pickDateStr(v: any) {
  const raw = v?.created_at || v?.createdAt || v?.date || v?.created || v?.timestamp;
  if (!raw) return "";
  return String(raw);
}

/* Auth current */
const pos = () => ({
  authCurrent: async () => {
    const data = await apiGetJson("/api/auth/current");
    return data;
  },
});

/* Ventas list */
const salesList = async (args: any): Promise<{ ok: boolean; items: SaleRow[] }> => {
  const data = await apiGetJson("/api/sales", {
    start: args?.start ? String(args.start) : undefined,
    end: args?.end ? String(args.end) : undefined,
    status: args?.status ? String(args.status) : undefined,
    limit: args?.limit != null ? String(args.limit) : undefined,
    offset: args?.offset != null ? String(args.offset) : undefined,
  });

  const list = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.sales)
    ? data.sales
    : Array.isArray(data?.rows)
    ? data.rows
    : [];

  const items: SaleRow[] = list.map((s: any) => {
    const userObj = s?.user;
    const userId =
      typeof userObj === "string" || typeof userObj === "number" ? String(userObj) : pickId(userObj);

    return {
      id: pickId(s),
      created_at: pickDateStr(s) || "",
      user_id: userId || "",
      status: String(s?.status || "COMPLETED").toUpperCase(),
      subtotal: Number(s?.subtotal_gross ?? s?.subtotal ?? 0) || 0,
      discount_total: Number(s?.discount_total ?? 0) || 0,
      tax_total: Number(s?.tax_total ?? 0) || 0,
      total: Number(s?.total ?? 0) || 0,
      client: s?.client ?? s?.location ?? null,
    } as SaleRow;
  });

  return { ok: true, items };
};

/* Venta detalle */
const salesGetById = async (
  id: any
): Promise<{ ok: boolean; sale: any; items: SaleItem[]; payments: Payment[]; returns: any[] }> => {
  const data = await apiGetJson(`/api/sales/${encodeURIComponent(String(id))}`);

  const itemsRaw = Array.isArray(data?.items) ? data.items : [];
  const paymentsRaw = Array.isArray(data?.payments) ? data.payments : [];

  const items: SaleItem[] = itemsRaw.map((it: any) => {
    const saleId = pickId(it?.sale) || pickId(data?.sale);
    const prod = it?.product;
    const prodId = typeof prod === "string" || typeof prod === "number" ? String(prod) : pickId(prod);

    return {
      id: pickId(it),
      sale_id: saleId || "",
      product_id: prodId || "",
      qty: Number(it?.qty ?? 0) || 0,
      unit_price: Number(it?.unit_price ?? it?.unitPrice ?? 0) || 0,
      line_discount: Number(it?.line_discount ?? it?.lineDiscount ?? 0) || 0,
      tax_rate: it?.tax_rate == null ? null : Number(it.tax_rate),
      tax_amount: Number(it?.tax ?? it?.tax_amount ?? it?.taxAmount ?? 0) || 0,
      line_total: Number(it?.total ?? it?.line_total ?? it?.lineTotal ?? 0) || 0,
      name_snapshot: String(it?.name_snapshot ?? it?.name ?? it?.product_name ?? ""),
      category_snapshot: it?.category_snapshot ?? null,
    };
  });

  const payments: Payment[] = paymentsRaw.map((p: any) => {
    const saleId = pickId(p?.sale) || pickId(data?.sale);
    return {
      id: pickId(p),
      sale_id: saleId || "",
      method: String(p?.method || "OTHER").toUpperCase(),
      provider: p?.provider ? String(p.provider).toUpperCase() : null,
      amount: Number(p?.amount ?? 0) || 0,
      change_given: Number(p?.change_given ?? p?.changeGiven ?? 0) || 0,
      reference: p?.reference ?? null,
      created_at: pickDateStr(p) || "",
    } as Payment;
  });

  return { ok: true, sale: data?.sale || null, items, payments, returns: data?.returns || [] };
};

/* ===== Formato ===== */
const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const fmtCOP = (n: number) => COP.format(n);
const methodLabel = (m: Payment["method"] | "NEQUI" | "DAVIPLATA" | string) => {
  switch (String(m).toUpperCase()) {
    case "CASH":
      return "Efectivo";
    case "CARD":
      return "Tarjeta";
    case "TRANSFER":
      return "Transferencia";
    case "OTHER":
      return "Otro";
    case "NEQUI":
      return "Nequi";
    case "DAVIPLATA":
      return "Daviplata";
    default:
      return String(m);
  }
};
const statusLabel = (s: SaleRow["status"] | string) =>
  ({ COMPLETED: "Completada", VOIDED: "Anulada", PARTIAL_REFUND: "Reembolso parcial", REFUNDED: "Reembolsada" } as any)[
    String(s).toUpperCase()
  ] || String(s);

/* ===== Estilos / Tema ===== */
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
  marginBottom: 14,
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
  padding: "14px 16px",
  fontWeight: 800,
  background: "#fafafc",
  borderBottom: "1px solid #eef0f4",
};
const rowBase: React.CSSProperties = { padding: "12px 16px", borderTop: "1px solid #f0f1f5" };
const th: React.CSSProperties = { fontSize: 13, color: "#333", fontWeight: 700, minWidth: 0 };
const td: React.CSSProperties = { fontSize: 14, color: "#111", minWidth: 0 };

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

const btn: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
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

/* ===== Helpers fecha/hora (filtro) ===== */
const pad2 = (n: number) => String(n).padStart(2, "0");

const normTime = (t?: string, end = false) => {
  const raw = (t || "").trim();
  const parts = raw.split(":");
  let H = Number(parts[0]);
  let M = Number(parts[1]);
  if (!Number.isFinite(H)) H = end ? 23 : 0;
  if (!Number.isFinite(M)) M = end ? 59 : 0;
  H = Math.min(23, Math.max(0, Math.trunc(H)));
  M = Math.min(59, Math.max(0, Math.trunc(M)));
  const S = end ? 59 : 0;
  return `${pad2(H)}:${pad2(M)}:${pad2(S)}`;
};

function isoCO(dateStr: string, timeStr: string, end: boolean) {
  const d = String(dateStr || "").trim();
  if (!d) return "";
  const t = normTime(timeStr, end);
  return `${d}T${t}-05:00`;
}

function msFromIso(s: string) {
  const v = String(s || "").trim();
  if (!v) return null;
  const d = new Date(v);
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function parseAnyDateMs(v: any): number | null {
  if (!v) return null;
  if (v instanceof Date) {
    const ms = v.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof v !== "string") return null;

  const s = v.trim();
  if (!s) return null;

  const d0 = new Date(s);
  const ms0 = d0.getTime();
  if (!Number.isNaN(ms0)) return ms0;

  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m1) {
    const yy = parseInt(m1[1], 10);
    const mm = parseInt(m1[2], 10);
    const dd = parseInt(m1[3], 10);
    const HH = parseInt(m1[4], 10);
    const MM = parseInt(m1[5], 10);
    const SS = parseInt(m1[6] || "0", 10);
    const d = new Date(yy, mm - 1, dd, HH, MM, SS);
    const ms = d.getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m2) {
    const dd = parseInt(m2[1], 10);
    const mm = parseInt(m2[2], 10);
    const yy = parseInt(m2[3], 10);
    const HH = parseInt(m2[4] || "0", 10);
    const MM = parseInt(m2[5] || "0", 10);
    const SS = parseInt(m2[6] || "0", 10);
    const d = new Date(yy, mm - 1, dd, HH, MM, SS);
    const ms = d.getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  return null;
}

/* ===== CSS local ===== */
const localCss = `
  html, body { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  .page-root { animation: pageIn 260ms ease both; }
  @keyframes pageIn { from { opacity:0; transform: translateY(6px) scale(0.99); } to { opacity:1; transform: translateY(0) scale(1); } }

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
  input:focus, select:focus, button:focus { outline: none; box-shadow: 0 0 0 3px rgba(${YRGB},0.18); border-color: rgba(${YRGB},0.65) !important; }

  .table-scroll { overflow-x: auto; }
  .minw-state { min-width: 420px; }
  .minw-pay { min-width: 340px; }
  .minw-top { min-width: 520px; }

  .two-col { display:grid; grid-template-columns: minmax(0,1.2fr) minmax(0,.8fr); gap:12px; }
  @media (max-width: 980px){ .two-col { grid-template-columns: 1fr; } }

  @media (max-width: 560px){
    input, select, button { font-size: 16px; }
  }

  @media (prefers-reduced-motion: reduce){
    .page-root, .cardfx, .btn-animate { animation:none !important; transition:none !important; }
  }
`;

/* =================== Página =================== */
const SalesReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me>(null);

  /* Filtros por defecto: día actual (datetime.ts) */
  const [startDate, setStartDate] = useState<string>(() => todayStrCO());
  const [endDate, setEndDate] = useState<string>(() => todayStrCO());
  const [startTime, setStartTime] = useState<string>("00:00");
  const [endTime, setEndTime] = useState<string>("23:59");
  const [statusFilter, setStatusFilter] = useState<string>("");

  /* Filtros de producto */
  const [productFilter, setProductFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  /* Data */
  const [rowsRaw, setRowsRaw] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Detalles opcionales */
  const [includePayments, setIncludePayments] = useState(false);
  const [includeTopProducts, setIncludeTopProducts] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [paymentsAgg, setPaymentsAgg] = useState<Record<string, number>>({});
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);

  const limit = 200;
  const hardCap = 2000;

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

  /* Carga sesión */
  useEffect(() => {
    (async () => {
      try {
        const cur = await pos().authCurrent?.();
        if (cur?.ok && cur.user) setMe(cur.user);
        else setMe(null);
      } catch {
        setMe(null);
      }
    })();
  }, []);

  /* Carga ventas */
  async function fetchAllSales() {
    setError(null);
    setLoading(true);

    try {
      const st = statusFilter || undefined;

      const startIso = startDate ? isoCO(startDate, startTime, false) : "";
      const endIso = endDate ? isoCO(endDate, endTime, true) : "";

      let startMs = startIso ? msFromIso(startIso) : null;
      let endMs = endIso ? msFromIso(endIso) : null;

      if (startMs != null && endMs != null && endMs < startMs) {
        const tmpMs = startMs;
        startMs = endMs;
        endMs = tmpMs;

        const tmpIso = startIso;
        const fixedStartIso = endIso;
        const fixedEndIso = tmpIso;

        const acc: SaleRow[] = [];
        let offset = 0;

        while (acc.length < hardCap) {
          const res = await salesList({ start: fixedStartIso, end: fixedEndIso, status: st, limit, offset });
          const items = res.items;

          acc.push(...items);

          if (items.length < limit) break;
          offset += limit;
          break;
        }

        const filtered = acc.filter((r) => {
          const ms = parseAnyDateMs(r.created_at);
          if (ms == null) return false;
          if (startMs != null && ms < startMs) return false;
          if (endMs != null && ms > endMs) return false;
          return true;
        });

        setRowsRaw(filtered);
        return;
      }

      const hasBounds = startMs != null || endMs != null;

      const acc: SaleRow[] = [];
      let offset = 0;

      while (acc.length < hardCap) {
        const res = await salesList({
          start: startIso || undefined,
          end: endIso || undefined,
          status: st,
          limit,
          offset,
        });
        const items = res.items;

        acc.push(...items);

        if (items.length < limit) break;
        offset += limit;
        break;
      }

      const filtered = !hasBounds
        ? acc
        : acc.filter((r) => {
            const ms = parseAnyDateMs(r.created_at);
            if (ms == null) return false;
            if (startMs != null && ms < startMs) return false;
            if (endMs != null && ms > endMs) return false;
            return true;
          });

      setRowsRaw(filtered);
    } catch (e: any) {
      setRowsRaw([]);
      setError(e?.message || "Error cargando ventas");
    } finally {
      setLoading(false);
    }
  }

  /* Carga en cambios de filtros */
  useEffect(() => {
    fetchAllSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, startTime, endTime, statusFilter]);

  /* Filtro adicional front: SOLO estado */
  const rows = useMemo(() => {
    if (!statusFilter) return rowsRaw;
    const st = statusFilter.toUpperCase();
    return rowsRaw.filter((r) => String(r.status).toUpperCase() === st);
  }, [rowsRaw, statusFilter]);

  /* KPIs */
  const nonVoided = useMemo(() => rows.filter((r) => r.status !== "VOIDED"), [rows]);
  const grossTotal = useMemo(() => nonVoided.reduce((a, r) => a + (r.total || 0), 0), [nonVoided]);
  const tickets = nonVoided.length;
  const avgTicket = tickets > 0 ? Math.round(grossTotal / tickets) : 0;

  const statusSummary = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    for (const r of rows) {
      const k = String(r.status).toUpperCase();
      if (!map[k]) map[k] = { count: 0, total: 0 };
      map[k].count += 1;
      map[k].total += r.total || 0;
    }
    return map;
  }, [rows]);

  /* Detalles (pagos / top productos) */
  async function fetchDetails(sales: SaleRow[]) {
    setLoadingDetails(true);
    try {
      const pay: Record<string, number> = {};
      const prod: Record<string, TopProduct> = {};

      for (const s of sales) {
        const d = await salesGetById(s.id);
        if (!d) continue;

        if (includePayments) {
          for (const p of (d.payments || []) as Payment[]) {
            const method = String(p.method || "").toUpperCase();
            let key = method;
            if (method === "TRANSFER") {
              const prov = String(p.provider || "").toUpperCase();
              if (prov === "NEQUI" || prov === "DAVIPLATA") key = prov;
            }
            pay[key] = (pay[key] || 0) + (Number.isFinite(p.amount) ? p.amount : 0);
          }
        }

        if (includeTopProducts) {
          for (const it of (d.items || []) as SaleItem[]) {
            const name = it.name_snapshot || String(it.product_id);
            const category = it.category_snapshot || null;
            const key = `${name}||${category || ""}`;
            const current = prod[key] || { name, qty: 0, amount: 0, category };
            current.qty += it.qty;
            current.amount += Number.isFinite(it.line_total) ? it.line_total : 0;
            prod[key] = current;
          }
        }
      }

      if (includePayments) setPaymentsAgg(pay);

      if (includeTopProducts) {
        setTopProducts(
          Object.values(prod)
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 50)
        );
      }
    } finally {
      setLoadingDetails(false);
    }
  }

  useEffect(() => {
    setPaymentsAgg({});
    setTopProducts([]);
    setProductFilter("");
    setCategoryFilter("");

    if (rows.length && (includePayments || includeTopProducts)) {
      fetchDetails(rows);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, includePayments, includeTopProducts]);

  /* Opciones de producto / categoría */
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of topProducts) {
      const cat = (p.category || "").trim();
      if (cat) set.add(cat);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [topProducts]);

  const productOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of topProducts) {
      if (categoryFilter && (p.category || "").trim() !== categoryFilter) continue;
      set.add(p.name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [topProducts, categoryFilter]);

  const filteredTopProducts = useMemo(() => {
    return topProducts.filter((p) => {
      if (categoryFilter && (p.category || "").trim() !== categoryFilter) return false;
      if (productFilter && p.name !== productFilter) return false;
      return true;
    });
  }, [topProducts, productFilter, categoryFilter]);

  /* Acciones rápidas */
  const quickToday = () => {
    const t = todayStrCO();
    setStartDate(t);
    setEndDate(t);
    setStartTime("00:00");
    setEndTime("23:59");
  };

  const quickWeek = () => {
    const t = todayStrCO();
    setStartDate(daysAgoStrCO(6));
    setEndDate(t);
    setStartTime("00:00");
    setEndTime("23:59");
  };

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setStartTime("");
    setEndTime("");
    setStatusFilter("");
    setProductFilter("");
    setCategoryFilter("");
  };

  return (
    <div style={shell} className="page-root">
      <div style={main}>
        <div style={container}>
          {/* Header */}
          <header style={header}>
            <div style={titleRow}>
              <button
                style={backBtn}
                className="btn-animate"
                onClick={() => navigate("/dashboard")}
                aria-label="Volver al dashboard"
              >
                <IHome />
              </button>
              <div>
                <h1 style={h1}>REPORTES DE VENTAS</h1>
                <p style={subtitle}>Totales, estados, pagos y top productos</p>
              </div>
            </div>
            {me && (
              <div style={{ fontSize: 12, color: MUTED }}>
                Sesión: {(me as any).name || (me as any)?.user?.name} ({(me as any).role || (me as any)?.user?.role})
              </div>
            )}
          </header>

          {/* Filtros */}
          <div style={{ ...card, padding: 12, marginBottom: 12 }} className="cardfx">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 12,
                alignItems: "center",
              }}
            >
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.currentTarget.value)} style={input} />
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.currentTarget.value)} style={input} />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.currentTarget.value)} style={input} />
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.currentTarget.value)} style={input} />

              <select value={statusFilter} onChange={(e) => setStatusFilter(e.currentTarget.value)} style={input}>
                <option value="">Todos los estados</option>
                <option value="COMPLETED">Completadas</option>
                <option value="VOIDED">Anuladas</option>
                <option value="PARTIAL_REFUND">Reembolso parcial</option>
                <option value="REFUNDED">Reembolsadas</option>
              </select>

              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={includePayments} onChange={(e) => setIncludePayments(e.currentTarget.checked)} />
                Desglose de pagos
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={includeTopProducts}
                  onChange={(e) => setIncludeTopProducts(e.currentTarget.checked)}
                />
                Top productos
              </label>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.currentTarget.value)}
                style={input}
                disabled={!includeTopProducts || categoryOptions.length === 0}
              >
                <option value="">Todas las categorías</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.currentTarget.value)}
                style={input}
                disabled={!includeTopProducts || productOptions.length === 0}
              >
                <option value="">Todos los productos</option>
                {productOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button onClick={quickToday} style={btn} className="btn-animate">
                Hoy
              </button>
              <button onClick={quickWeek} style={btn} className="btn-animate">
                Semana
              </button>
              <button onClick={() => fetchAllSales()} style={btnSoft} className="btn-animate">
                {loading ? "Cargando…" : "Aplicar"}
              </button>
              <button onClick={clearFilters} style={btn} className="btn-animate">
                Limpiar
              </button>
            </div>

            {error && (
              <div
                style={{
                  marginTop: 8,
                  color: "#b00020",
                  background: "rgba(176,0,32,0.10)",
                  border: "1px solid rgba(176,0,32,0.28)",
                  padding: 8,
                  borderRadius: 8,
                }}
              >
                {error}
              </div>
            )}
          </div>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <div style={{ ...card, padding: 12 }} className="cardfx">
              <div style={{ color: MUTED }}>Ventas brutas (no incluye anuladas)</div>
              <div style={{ fontWeight: 800, fontSize: 22, fontVariantNumeric: "tabular-nums" }}>{fmtCOP(grossTotal)}</div>
            </div>
            <div style={{ ...card, padding: 12 }} className="cardfx">
              <div style={{ color: MUTED }}>Tickets</div>
              <div style={{ fontWeight: 800, fontSize: 22 }}>{tickets}</div>
            </div>
            <div style={{ ...card, padding: 12 }} className="cardfx">
              <div style={{ color: MUTED }}>Ticket promedio</div>
              <div style={{ fontWeight: 800, fontSize: 22, fontVariantNumeric: "tabular-nums" }}>{fmtCOP(avgTicket)}</div>
            </div>
            <div style={{ ...card, padding: 12 }} className="cardfx">
              <div style={{ color: MUTED }}>Ventas totales (incluye anuladas)</div>
              <div style={{ fontWeight: 800, fontSize: 22 }}>{rows.length}</div>
            </div>
          </div>

          {/* Resumen por estado + Estado de carga */}
          <div className="two-col" style={{ marginTop: 12 }}>
            <div style={card} className="cardfx">
              <div style={sectionTitle}>Totales por estado</div>

              <div style={{ ...rowBase, borderTop: "none", paddingTop: 10, paddingBottom: 10 }} className="table-scroll">
                <div style={{ ...th }} className="minw-state">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 140px", gap: 10, alignItems: "center" }}>
                    <div>Estado</div>
                    <div style={{ textAlign: "right" }}>Tickets</div>
                    <div style={{ textAlign: "right" }}>Total</div>
                  </div>
                </div>
              </div>

              <div className="table-scroll">
                <div className="minw-state">
                  {Object.keys(statusSummary).length === 0 ? (
                    <div style={{ padding: 16 }}>Sin datos</div>
                  ) : (
                    Object.entries(statusSummary).map(([st, v]) => (
                      <div key={st} style={{ ...rowBase }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 140px", gap: 10, alignItems: "center" }}>
                          <div style={{ ...td, fontWeight: 700 }}>{statusLabel(st)}</div>
                          <div style={{ ...td, textAlign: "right" }}>{v.count}</div>
                          <div style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCOP(v.total)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div style={card} className="cardfx">
              <div style={sectionTitle}>Estado de carga</div>
              <div style={{ padding: 12 }}>
                <div>Ventas: {loading ? "cargando…" : rows.length}</div>
                {(includePayments || includeTopProducts) && <div>Detalles: {loadingDetails ? "cargando…" : "listo"}</div>}
              </div>
            </div>
          </div>

          {/* Desglose de pagos */}
          {includePayments && (
            <div style={{ ...card, marginTop: 12 }} className="cardfx">
              <div style={sectionTitle}>Desglose por método/proveedor</div>

              <div style={{ ...rowBase, borderTop: "none", paddingTop: 10, paddingBottom: 10 }} className="table-scroll">
                <div style={{ ...th }} className="minw-pay">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 10, alignItems: "center" }}>
                    <div>Método</div>
                    <div style={{ textAlign: "right" }}>Monto</div>
                  </div>
                </div>
              </div>

              <div className="table-scroll">
                <div className="minw-pay">
                  {Object.keys(paymentsAgg).length === 0 ? (
                    <div style={{ padding: 16 }}>Sin datos</div>
                  ) : (
                    Object.entries(paymentsAgg).map(([m, v]) => (
                      <div key={m} style={{ ...rowBase }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 10, alignItems: "center" }}>
                          <div style={td}>{methodLabel(m)}</div>
                          <div style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCOP(v)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ padding: "8px 16px 16px 16px", color: MUTED, fontSize: 12 }}>
                Nota: si hubo reembolsos, los montos pueden ser negativos.
              </div>
            </div>
          )}

          {/* Top productos */}
          {includeTopProducts && (
            <div style={{ ...card, marginTop: 12 }} className="cardfx">
              <div style={sectionTitle}>Top productos</div>

              <div style={{ ...rowBase, borderTop: "none", paddingTop: 10, paddingBottom: 10 }} className="table-scroll">
                <div style={{ ...th }} className="minw-top">
                  <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 100px 140px", gap: 10, alignItems: "center" }}>
                    <div>Producto</div>
                    <div>Categoría</div>
                    <div style={{ textAlign: "right" }}>Unidades</div>
                    <div style={{ textAlign: "right" }}>Monto</div>
                  </div>
                </div>
              </div>

              <div className="table-scroll">
                <div className="minw-top">
                  {filteredTopProducts.length === 0 ? (
                    <div style={{ padding: 16 }}>Sin datos</div>
                  ) : (
                    filteredTopProducts.map((p) => (
                      <div key={`${p.name}||${p.category || ""}`} style={{ ...rowBase }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 100px 140px", gap: 10, alignItems: "center" }}>
                          <div style={td}>{p.name}</div>
                          <div style={{ ...td, color: MUTED }}>{p.category || "Sin categoría"}</div>
                          <div style={{ ...td, textAlign: "right" }}>{p.qty}</div>
                          <div style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCOP(p.amount)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          <style>{localCss}</style>
        </div>
      </div>
    </div>
  );
};

export default SalesReportsPage;
