import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/* ================= Tipos ================= */
type Role = "admin" | "vendedor";
type Me = { id: string; username: string; name: string; role: Role } | null;

type PlaceType = "MESA" | "BARRA";
type UiView = "MAP" | "DETAIL" | "CLOSED";

type ProductKind = "STANDARD" | "COCKTAIL" | "BASE" | "ACCOMP";

type Product = {
  id: string;
  legacy_id?: number;
  name: string;
  category: string;
  price: number;
  stock: number;
  stock_available?: number;
  min_stock: number;
  is_active?: boolean;
  kind?: ProductKind;
  inv_type?: string;
  measure?: string;
};

type Totals = {
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
};

type TabItem = {
  id: string;
  tab_id: string;
  product_id: string;
  qty: number;
  unit_price: number;
  line_discount: number;
  tax_rate: number | null;
  tax_amount: number;
  line_total: number;
  name_snapshot: string;
  category_snapshot?: string | null;
  added_at: string;
};

type Tab = {
  id: string;
  name: string;
  status: "OPEN" | "CLOSED";
  user_id?: string | null;
  notes?: string | null;
  opened_at: string;
  closed_at?: string | null;
  items?: TabItem[];
  totals?: Totals;
};

type RecipeItem = {
  ingredient_id: string;
  ingredient_name?: string | null;
  ingredient_type?: string | null;
  ingredient_measure?: string | null;
  qty: number;
  role: "BASE" | "ACCOMP";
  unit?: string | null;
  note?: string | null;
};

type PayMethod = "CASH" | "CARD" | "TRANSFER" | "OTHER";
type TransferProvider = "NEQUI" | "DAVIPLATA";
type Payment = {
  method: PayMethod;
  amount: number;
  provider?: TransferProvider;
  reference?: string;
};

/* Línea de pago en el modal */
type PayLine = {
  id: string;
  method: PayMethod;
  amountStr: string;
  provider: TransferProvider;
  reference: string;
};

type ConfirmKind =
  | "OPEN_SLOT"
  | "CLOSE_TAB_ONLY"
  | "CLEAR_TAB"
  | "REMOVE_ITEM"
  | "REOPEN_TAB";
type ConfirmState = {
  kind: ConfirmKind;
  title: string;
  body: string;
  confirmText: string;
  danger?: boolean;
  payload?: any;
};

/* =============== HTTP helpers ONLINE =============== */
type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";
type ApiResp<T = any> = { ok: boolean; error?: string } & T;

const API_BASE = (process.env.REACT_APP_API_URL || "").replace(/\/+$/, "");

function getToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("authToken") || "";
}

function setToken(token?: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem("authToken", token);
  else window.localStorage.removeItem("authToken");
}

function buildQuery(params: Record<string, any>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

async function httpJSON<T = any>(
  method: HttpMethod,
  path: string,
  body?: any,
  opts?: { auth?: boolean }
): Promise<ApiResp<T>> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (opts?.auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const txt = await res.text();
    let data: any = null;
    try {
      data = txt ? JSON.parse(txt) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` } as any;
    }

    if (data && typeof data.ok === "boolean") return data;
    return ({ ok: true, ...(data || {}) } as any) as ApiResp<T>;
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) } as any;
  }
}

/* =============== API wrappers =============== */
const authMe = () =>
  httpJSON<{ user?: Me }>("GET", "/api/auth/me", undefined, { auth: true });

const productsList = (q: string) =>
  httpJSON<{ items?: Product[] }>(
    "GET",
    `/api/products${buildQuery({ q })}`,
    undefined,
    { auth: true }
  );

const recipeGetOnline = (productId: string) =>
  httpJSON<{ items?: any[] }>("GET", `/api/recipes/${productId}`, undefined, {
    auth: true,
  });

const tabsListOnline = (status: "OPEN" | "CLOSED" | "ALL") =>
  httpJSON<{ items?: any[] }>(
    "GET",
    `/api/tabs${buildQuery({ status })}`,
    undefined,
    { auth: true }
  );

const tabsReservationsSummary = async (status?: "OPEN" | "CLOSED" | "ALL") => {
  const query = buildQuery({ status: status || "OPEN" });
  const r = await httpJSON<{ items?: any[] }>(
    "GET",
    `/api/tabs/reservations/summary${query}`,
    undefined,
    { auth: true }
  );
  if (!r.ok) return r as any;

  const rawItems = Array.isArray((r as any).items)
    ? ((r as any).items as unknown[])
    : [];
  const items = rawItems.map((x: unknown) => {
    const xx = x as any;
    return {
      product_id: String(xx?.product_id ?? xx?.productId ?? ""),
      reserved_qty: toNum(xx?.reserved_qty, 0),
    };
  });

  return { ok: true, items } as any;
};

const tabsGetOnline = (id: string) =>
  httpJSON("GET", `/api/tabs/${id}`, undefined, { auth: true });

const tabsCreateOnline = (payload: { name: string; notes?: string | null }) =>
  httpJSON("POST", "/api/tabs", payload, { auth: true });

const tabsRenameOnline = (id: string, name: string) =>
  httpJSON("PUT", `/api/tabs/${id}/rename`, { name }, { auth: true });

const tabsSetNoteOnline = (id: string, notes: string) =>
  httpJSON("PUT", `/api/tabs/${id}/note`, { notes }, { auth: true });

const tabsAddItemOnline = (tabId: string, payload: any) =>
  httpJSON("POST", `/api/tabs/${tabId}/items`, payload, { auth: true });

const tabsUpdateItemOnline = (itemId: string, payload: any) =>
  httpJSON("PUT", `/api/tabs/items/${itemId}`, payload, { auth: true });

const tabsRemoveItemOnline = (itemId: string) =>
  httpJSON("DELETE", `/api/tabs/items/${itemId}`, undefined, { auth: true });

const tabsClearOnline = (tabId: string) =>
  httpJSON("POST", `/api/tabs/${tabId}/clear`, {}, { auth: true });

const tabsCloseOnline = (tabId: string) =>
  httpJSON("POST", `/api/tabs/${tabId}/close`, {}, { auth: true });

const tabsReopenOnline = (tabId: string) =>
  httpJSON("POST", `/api/tabs/${tabId}/reopen`, {}, { auth: true });

const tabsDeleteOnline = (tabId: string) =>
  httpJSON("DELETE", `/api/tabs/${tabId}`, undefined, { auth: true });

/* Crea venta real en BD */
const salesCreateOnline = (payload: any) =>
  httpJSON("POST", "/api/sales", payload, { auth: true });

/* Mantener si aún lo usas en otra parte */
const salesCreateWithRecipesOnline = (payload: any) =>
  httpJSON("POST", "/api/sales/with-recipes", payload, { auth: true });

/* =============== Helpers =============== */
const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const YRGB = "244,194,43";
const BG = "#f7f8fb";
const TEXT = "#222831";
const MUTED = "#6b7280";
const RADIUS = 14;

function toNum(v: any, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function fmtTimeAMPM(iso: string) {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const am = h < 12;
  const hh = h % 12 || 12;
  return `${hh}:${pad2(m)} ${am ? "a. m." : "p. m."}`;
}

/* Formato dd/mm/yyyy */
function fmtDateDMY(iso: string) {
  const d = new Date(iso);
  const dd = pad2(d.getDate());
  const mm = pad2(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/* Formato dd/mm/yyyy · hh:mm am/pm */
function fmtDateTimeDMY(iso: string) {
  return `${fmtDateDMY(iso)} · ${fmtTimeAMPM(iso)}`;
}

/* Calcula valores de línea localmente para UI reactiva */
function calcLineLocal(
  qty: number,
  unitPrice: number,
  lineDiscount: number,
  taxRate: number | null
) {
  const q = Math.max(0, toNum(qty, 0));
  const unit = Math.max(0, toNum(unitPrice, 0));
  const disc = Math.max(0, toNum(lineDiscount, 0));

  const gross = unit * q;
  const base = Math.max(0, gross - disc);

  const rate = taxRate === null ? 0 : Math.max(0, toNum(taxRate, 0));
  const tax = rate > 0 ? Math.round((base * rate) / 100) : 0;

  return { tax_amount: tax, line_total: base + tax };
}

function computeTabTotalsFromItems(tab: Tab): Totals {
  const items = tab.items || [];
  let subtotal = 0;
  let discount_total = 0;
  let tax_total = 0;
  let total = 0;

  for (const it of items) {
    const qty = toNum(it.qty, 0);
    const unit = toNum(it.unit_price, 0);
    const disc = Math.max(0, toNum(it.line_discount, 0));
    const gross = unit * qty;
    const base = Math.max(0, gross - disc);
    const tax = Math.max(0, toNum(it.tax_amount, 0));
    subtotal += base;
    discount_total += disc;
    tax_total += tax;
    total += Math.max(0, toNum(it.line_total, 0));
  }

  return { subtotal, discount_total, tax_total, total };
}

function computeTabTotalsWithInvoiceAdjust(
  tab: Tab,
  invoiceDiscountCOP: number,
  invoiceTaxRatePct: number | null
): Totals {
  const base = computeTabTotalsFromItems(tab);

  const safeDisc = Math.max(
    0,
    Math.min(
      Math.round(toNum(invoiceDiscountCOP, 0)),
      Math.round(base.subtotal || 0)
    )
  );
  const netSubtotal = Math.max(0, (base.subtotal || 0) - safeDisc);

  const nextDiscountTotal = (base.discount_total || 0) + safeDisc;

  let nextTaxTotal = base.tax_total || 0;
  if (invoiceTaxRatePct !== null) {
    const rr = Math.max(0, toNum(invoiceTaxRatePct, 0));
    nextTaxTotal = Math.round((netSubtotal * rr) / 100);
  } else if ((base.subtotal || 0) > 0 && safeDisc > 0) {
    const factor = netSubtotal / (base.subtotal || 1);
    nextTaxTotal = Math.round((base.tax_total || 0) * factor);
  }

  const nextTotal = Math.max(0, Math.round(netSubtotal + nextTaxTotal));

  return {
    subtotal: Math.max(0, Math.round(netSubtotal)),
    discount_total: Math.max(0, Math.round(nextDiscountTotal)),
    tax_total: Math.max(0, Math.round(nextTaxTotal)),
    total: nextTotal,
  };
}

function isAllowedForCatalog(p: Product) {
  const k = String(p.kind || p.inv_type || "").toUpperCase();
  return k === "STANDARD" || k === "COCKTAIL";
}

function normRecipeItem(x: any): RecipeItem | null {
  const ingredient_id = String(x?.ingredient_id ?? x?.ingredientId ?? "");
  if (!ingredient_id) return null;

  const roleRaw = String(x?.role || "").toUpperCase();
  const role: any =
    roleRaw === "BASE" ? "BASE" : roleRaw === "ACCOMP" ? "ACCOMP" : null;
  if (!role) return null;

  return {
    ingredient_id,
    ingredient_name: x?.ingredient_name ?? x?.ingredientName ?? null,
    ingredient_type: x?.ingredient_type ?? x?.ingredientType ?? null,
    ingredient_measure: x?.ingredient_measure ?? x?.ingredientMeasure ?? null,
    qty: toNum(x?.qty, 0),
    role,
    unit: x?.unit ? String(x.unit) : null,
    note: x?.note ? String(x.note) : null,
  };
}

/* ================= Icons ================= */
function IHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-10.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ITable() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M7 7v14M17 7v14M5 21h14a1 1 0 0 0 1-1V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v13a1 1 0 0 0 1 1Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IBar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 3h16l-6 8v9a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-9L4 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ISearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" strokeWidth="2" />
      <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function SalesTabsPage() {
  /* ================= Router ================= */
  const nav = useNavigate();

  /* ================= UI state ================= */
  const [, setMe] = useState<Me>(null);
  const [uiView, setUiView] = useState<UiView>("MAP");
  const [placeType, setPlaceType] = useState<PlaceType>("MESA");

  const [loading, setLoading] = useState(false);
  const [, setLoadingOne] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [msg, setMsg] = useState<string>("");
  const [toast, setToast] = useState<string>("");

  /* ================= Data state ================= */
  const [tabsOpen, setTabsOpen] = useState<Tab[]>([]);
  const [tabsClosed, setTabsClosed] = useState<Tab[]>([]);
  const [selected, setSelected] = useState<Tab | null>(null);

  const selectedRef = useRef<Tab | null>(null);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const [products, setProducts] = useState<Product[]>([]);
  const [pq, setPq] = useState("");
  const [pcat, setPcat] = useState("");

  /* ================= Notes / rename ================= */
  const [nameDraft, setNameDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");

  /* ================= Qty inline ================= */
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const qtyTimers = useRef<Record<string, number>>({});
  const lastQtySent = useRef<Record<string, number>>({});

  /* ================= Modals ================= */
  const [discountModalItem, setDiscountModalItem] = useState<TabItem | null>(null);
  const [discountCOPStr, setDiscountCOPStr] = useState("0");
  const [discountIVAStr, setDiscountIVAStr] = useState("");
  const [invoiceAdjOpen, setInvoiceAdjOpen] = useState(false);
  const [invoiceDiscountStr, setInvoiceDiscountStr] = useState("0");
  const [invoiceIVAStr, setInvoiceIVAStr] = useState("");

  const [detailModalProduct, setDetailModalProduct] = useState<Product | null>(null);
  const [detailModalAddedAt, setDetailModalAddedAt] = useState<string>("");

  const [confirmSaleOpen, setConfirmSaleOpen] = useState(false);
  const [payLines, setPayLines] = useState<PayLine[]>([]);
  const [saleNotes, setSaleNotes] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createNumberStr, setCreateNumberStr] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  /* ================= Cocktails availability ================= */
  const [cocktailAvail, setCocktailAvail] = useState<Record<string, number>>({});
  const recipeCache = useRef<Record<string, RecipeItem[]>>({});
  const [reservedAllOpen, setReservedAllOpen] = useState<Map<string, number>>(new Map());

  /* ================= Helper pagos ================= */
  const makePayLine = (partial?: Partial<PayLine>): PayLine => {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    return {
      id,
      method: "CASH",
      amountStr: "",
      provider: "NEQUI",
      reference: "",
      ...(partial || {}),
    };
  };

  /* ================= Styling ================= */
  const css = useMemo(() => {
    return `
      *,*::before,*::after{ box-sizing:border-box; }
      input,select,button{ box-sizing:border-box; }

      .st-root{
        min-height:100vh;
        background:${BG};
        color:${TEXT};
        padding:18px 18px 28px;
        animation:pageIn 260ms ease both;
      }
      @keyframes pageIn{
        from{opacity:0; transform: translateY(8px)}
        to{opacity:1; transform: none}
      }
      @media (prefers-reduced-motion: reduce){
        .st-root{ animation:none }
        .btn-animate,.cardfx{ transition:none }
      }

      .st-shell{
        width:min(1180px, 96vw);
        margin:0 auto;
      }

      .st-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:14px;
        margin-bottom:14px;
      }
      .st-head-left{
        display:flex;
        align-items:center;
        gap:12px;
        min-width:0;
      }
      .st-home{
        width:44px;
        height:44px;
        border-radius:12px;
        background:#fff;
        border:1px solid rgba(${YRGB},0.65);
        box-shadow:0 10px 24px rgba(0,0,0,0.05), inset 0 0 0 1px rgba(${YRGB},0.18);
        display:grid;
        place-items:center;
        cursor:pointer;
      }
      .st-titlebox{ min-width:0 }
      .st-title{
        margin:0;
        font-weight:900;
        font-size:28px;
        letter-spacing:0.4px;
      }
      .st-sub{
        margin:2px 0 0;
        color:${MUTED};
        font-weight:600;
      }

      .st-actions{
        display:flex;
        align-items:center;
        gap:10px;
        flex-wrap:wrap;
        justify-content:flex-end;
      }

      .pill{
        display:inline-flex;
        align-items:center;
        gap:8px;
        padding:8px 12px;
        border-radius:999px;
        border:1px solid rgba(0,0,0,0.10);
        background:rgba(255,255,255,0.66);
        font-weight:800;
        font-size:13px;
      }
      .pill-active{
        border-color: rgba(${YRGB},0.75);
        box-shadow: 0 0 0 3px rgba(${YRGB},0.16);
      }

      .seg{
        display:inline-flex;
        border-radius:999px;
        overflow:hidden;
        border:1px solid rgba(0,0,0,0.10);
        background: rgba(255,255,255,0.66);
      }
      .seg button{
        border:0;
        background:transparent;
        padding:8px 12px;
        font-weight:900;
        color:${MUTED};
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        gap:8px;
      }
      .seg button.active{
        color:${TEXT};
        background: rgba(${YRGB},0.18);
      }

      .btn{
        border:1px solid rgba(0,0,0,0.10);
        background:rgba(255,255,255,0.70);
        border-radius:12px;
        padding:10px 14px;
        font-weight:900;
        cursor:pointer;
      }
      .btn-primary{
        border-color: rgba(${YRGB},0.85);
        background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.62));
        box-shadow: 0 14px 30px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(${YRGB},0.18);
      }
      .btn-ghost{
        background:transparent;
      }
      .btn-danger{
        border-color: rgba(239,68,68,0.40);
        background: rgba(255,255,255,0.70);
        color:#b91c1c;
      }
      .btn-animate{
        transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
      }
      .btn-animate:hover{
        transform: translateY(-1px);
        border-color: rgba(${YRGB},0.90);
        box-shadow: 0 16px 34px rgba(0,0,0,0.07), 0 0 0 3px rgba(${YRGB},0.14);
      }
      .btn-animate:active{
        transform: translateY(0) scale(0.98);
      }

      .card{
        background: rgba(255,255,255,0.66);
        border: 1px solid rgba(${YRGB},0.42);
        border-radius: ${RADIUS}px;
        box-shadow: 0 18px 40px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(${YRGB},0.14);
        backdrop-filter: saturate(160%) blur(6px);
      }
      .cardfx{
        transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
      }
      .cardfx:hover{
        transform: translateY(-1px);
        border-color: rgba(${YRGB},0.70);
        box-shadow: 0 22px 46px rgba(0,0,0,0.07), inset 0 0 0 1px rgba(${YRGB},0.16);
      }
      .card-hd{
        padding:16px 18px 10px;
        border-bottom: 1px solid #eef0f4;
      }
      .card-bd{
        padding:14px 18px 18px;
      }
      .card-title{
        margin:0;
        font-weight:1000;
        font-size:16px;
      }
      .card-sub{
        margin:2px 0 0;
        color:${MUTED};
        font-weight:700;
      }

      .map-grid{
        display:grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap:12px;
        padding:14px 18px 18px;
      }
      @media (max-width: 1120px){
        .map-grid{ grid-template-columns: repeat(5, minmax(0, 1fr)); }
      }
      @media (max-width: 880px){
        .map-grid{ grid-template-columns: repeat(3, minmax(0, 1fr)); }
      }
      @media (max-width: 520px){
        .map-grid{ grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }

      .slot{
        border-radius: 14px;
        border: 1px solid rgba(0,0,0,0.12);
        background: rgba(255,255,255,0.78);
        padding:12px 12px 10px;
        cursor:pointer;
        box-shadow: 0 12px 26px rgba(0,0,0,0.04);
        min-height:72px;
      }
      .slot-name{
        margin:0;
        font-weight:1000;
        font-size:20px;
      }
      .slot-meta{
        margin:2px 0 0;
        color:${MUTED};
        font-weight:700;
        font-size:12px;
      }

      .badge{
        display:inline-flex;
        align-items:center;
        padding:4px 10px;
        border-radius:999px;
        border:1px solid rgba(0,0,0,0.10);
        background: rgba(243,244,246,0.85);
        color:${MUTED};
        font-weight:900;
        font-size:12px;
        margin-top:10px;
      }
      .badge-open{
        background: rgba(34,197,94,0.12);
        border-color: rgba(34,197,94,0.25);
        color:#166534;
      }
      .badge-low{
        background: rgba(245,158,11,0.12);
        border-color: rgba(245,158,11,0.25);
        color:#92400e;
      }

      .split{
        display:grid;
        grid-template-columns: 1fr 1.25fr;
        gap:14px;
        align-items:start;
      }
      @media (max-width: 980px){
        .split{ grid-template-columns: 1fr; }
      }

      .field{
        width:100%;
        height:42px;
        box-sizing:border-box;
        min-width:0;
        border-radius:12px;
        border:1px solid #e5e7eb;
        background: rgba(255,255,255,0.90);
        padding:0 12px;
        outline:none;
        font-weight:800;
      }
      .field:focus{
        border-color: rgba(${YRGB},0.85);
        box-shadow: 0 0 0 3px rgba(${YRGB},0.18);
      }

      .row{
        display:flex;
        gap:10px;
        align-items:center;
        flex-wrap:wrap;
      }

      .items-wrap{
        border-top: 1px solid #eef0f4;
        margin-top:12px;
        padding-top:12px;
      }
      .items-head{
        display:grid;
        grid-template-columns: 1.3fr 160px 170px;
        gap:10px;
        padding:8px 0 10px;
        color:${MUTED};
        font-weight:1000;
        font-size:13px;
      }
      .items-scroll{
        max-height: 540px;
        overflow:auto;
        padding-right:6px;
      }
      .item-row{
        display:grid;
        grid-template-columns: 1.3fr 160px 170px;
        gap:10px;
        align-items:center;
        border-top: 1px solid #f0f1f5;
        padding:14px 0;
      }
      .pname{
        margin:0;
        font-weight:1000;
      }
      .psub{
        margin:3px 0 0;
        color:${MUTED};
        font-weight:800;
        font-size:12px;
      }

      .qtybox{
        display:flex;
        gap:8px;
        align-items:center;
        justify-content:center;
      }
      .qbtn{
        width:34px;
        height:34px;
        border-radius:10px;
        border:1px solid rgba(0,0,0,0.10);
        background: rgba(255,255,255,0.80);
        font-weight:1000;
        cursor:pointer;
      }
      .qinput{
        width:46px;
        height:34px;
        box-sizing:border-box;
        border-radius:10px;
        border:1px solid rgba(0,0,0,0.10);
        text-align:center;
        font-weight:1000;
        outline:none;
        background: rgba(255,255,255,0.90);
      }
      .qinput:focus{
        border-color: rgba(${YRGB},0.85);
        box-shadow: 0 0 0 3px rgba(${YRGB},0.18);
      }

      .actcol{
        display:flex;
        flex-direction:column;
        gap:8px;
        align-items:flex-end;
      }
      .btn-sm{
        height:34px;
        padding:0 12px;
        border-radius:12px;
      }

      .totals{
        margin-top:12px;
        padding:14px 18px;
        display:grid;
        grid-template-columns: 1fr auto;
        gap:10px;
        align-items:center;
      }
      .totals-list{
        display:grid;
        gap:4px;
        font-weight:900;
        color:${MUTED};
      }
      .totals-list b{
        color:${TEXT};
      }
      .tot-actions{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
        justify-content:flex-end;
      }

      .cat-filters{
        display:grid;
        grid-template-columns: minmax(0,1fr) clamp(170px, 32vw, 240px);
        gap:10px;
        align-items:center;
      }
      @media (max-width: 820px){
        .cat-filters{ grid-template-columns:1fr; }
      }
      @media (max-width: 620px){
        .cat-filters{ grid-template-columns:1fr; }
      }
      .searchWrap{
        position:relative;
        min-width:0;
      }
      .searchIcon{
        position:absolute;
        left:12px;
        top:12px;
        color:${MUTED};
        opacity:0.75;
      }
      .searchInput{
        padding-left:38px;
      }

      .cat-grid{
        display:grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap:12px;
        margin-top:12px;
        padding-right:4px;
      }
      @media (max-width: 1120px){
        .cat-grid{ grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 520px){
        .cat-grid{ grid-template-columns: 1fr; }
      }

      .pcard{
        border-radius: 14px;
        border: 1px solid rgba(${YRGB},0.55);
        background: rgba(255,255,255,0.78);
        padding:12px 12px 10px;
        cursor:pointer;
      }
      .pcard.disabled{
        opacity:0.50;
        cursor:not-allowed;
        filter: grayscale(0.2);
      }
      .pc-top{
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:10px;
      }
      .pc-name{
        margin:0;
        font-weight:1000;
      }
      .pc-price{
        margin:0;
        font-weight:1000;
      }
      .pc-cat{
        margin:2px 0 0;
        color:${MUTED};
        font-weight:800;
        font-size:12px;
      }
      .pc-av{
        margin:10px 0 0;
        color:${MUTED};
        font-weight:900;
        font-size:12px;
        display:flex;
        gap:8px;
        align-items:center;
        flex-wrap:wrap;
      }

      .toast{
        position:fixed;
        top:14px;
        left:50%;
        transform: translateX(-50%);
        z-index:50;
        width:min(820px, 92vw);
        padding:12px 14px;
        border-radius:14px;
        border:1px solid rgba(${YRGB},0.55);
        background: rgba(255,255,255,0.82);
        box-shadow: 0 20px 46px rgba(0,0,0,0.08);
      }
      .toast b{ font-weight:1000 }
      .toastBar{
        height:3px;
        width:100%;
        margin-top:10px;
        border-radius:999px;
        background: rgba(${YRGB},0.18);
        overflow:hidden;
      }
      .toastBar > span{
        display:block;
        height:100%;
        width:100%;
        background: rgba(${YRGB},0.75);
        transform-origin:left center;
        animation: toastP 5s linear both;
      }
      @keyframes toastP{
        from{transform:scaleX(1)}
        to{transform:scaleX(0)}
      }

      .modal-grid{
        display:grid;
        grid-template-columns: minmax(0,1fr) minmax(0,1fr);
        gap:12px;
      }
      @media (max-width: 780px){
        .modal-grid{
          grid-template-columns: 1fr;
        }
      }

      /* Layout filas de pago */
      .payRow{
        display:grid;
        grid-template-columns: 160px minmax(0,1fr) minmax(0,1fr) 110px;
        gap:12px;
        align-items:end;
      }
      @media (max-width: 780px){
        .payRow{ grid-template-columns: 1fr; }
      }
      .payRefRow{
        display:flex;
        gap:10px;
        align-items:center;
      }
      @media (max-width: 780px){
        .payRefRow{
          flex-direction:column;
          align-items:stretch;
        }
      }
      .payCards{
        margin-top:12px;
        display:grid;
        grid-template-columns: minmax(0,1fr) minmax(0,1fr);
        gap:12px;
      }
      @media (max-width: 780px){
        .payCards{ grid-template-columns: 1fr; }
      }

      @media (max-width: 520px){
        input, select, button { font-size:16px; }
      }
    `;
  }, []);

  /* ================= Normalize API shapes ================= */
  const normalizeProduct = (x: any): Product => {
    return {
      id: String(x?._id ?? x?.id ?? ""),
      legacy_id: x?.legacy_id ?? x?.legacyId,
      name: String(x?.name ?? ""),
      category: String(x?.category ?? ""),
      price: toNum(x?.price, 0),
      stock: toNum(x?.stock, 0),
      stock_available:
        x?.stock_available !== undefined ? toNum(x.stock_available, 0) : undefined,
      min_stock: toNum(x?.min_stock ?? x?.minStock, 0),
      is_active:
        x?.is_active !== undefined
          ? !!x.is_active
          : x?.isActive !== undefined
          ? !!x.isActive
          : true,
      kind: (x?.kind || x?.product_kind || x?.inv_type || x?.type) as any,
      inv_type: x?.inv_type ? String(x.inv_type) : undefined,
      measure: x?.measure ? String(x.measure) : undefined,
    };
  };

  const normalizeTabItem = (x: any): TabItem => {
    const prod = (x as any)?.product;
    const product_id = String(
      (x as any)?.product_id ??
        (x as any)?.productId ??
        (typeof prod === "string" ? prod : prod?._id ?? prod?.id ?? "") ??
        ""
    );
    const tab_id = String(
      (x as any)?.tab_id ??
        (x as any)?.tabId ??
        (x as any)?.tab ??
        (x as any)?.tab?._id ??
        (x as any)?.tab?.id ??
        ""
    );

    const qty = toNum((x as any)?.qty, 0);
    const unit_price = toNum((x as any)?.unit_price ?? (x as any)?.unitPrice, 0);
    const line_discount = toNum(
      (x as any)?.line_discount ?? (x as any)?.lineDiscount,
      0
    );
    const tax_rate =
      (x as any)?.tax_rate === null || (x as any)?.tax_rate === undefined
        ? null
        : toNum((x as any).tax_rate, 0);

    const local = calcLineLocal(qty, unit_price, line_discount, tax_rate);

    return {
      id: String((x as any)?._id ?? (x as any)?.id ?? ""),
      tab_id,
      product_id,
      qty,
      unit_price,
      line_discount,
      tax_rate,
      tax_amount:
        (x as any)?.tax_amount !== undefined
          ? toNum((x as any)?.tax_amount, 0)
          : local.tax_amount,
      line_total:
        (x as any)?.line_total !== undefined
          ? toNum((x as any)?.line_total, 0)
          : local.line_total,
      name_snapshot: String(
        (x as any)?.name_snapshot ??
          (x as any)?.nameSnapshot ??
          (x as any)?.name ??
          (typeof prod === "object" && prod ? prod.name : "") ??
          ""
      ),
      category_snapshot:
        (x as any)?.category_snapshot ??
        (x as any)?.categorySnapshot ??
        (typeof prod === "object" && prod ? prod.category : null) ??
        null,
      added_at: String(
        (x as any)?.added_at ??
          (x as any)?.addedAt ??
          (x as any)?.createdAt ??
          new Date().toISOString()
      ),
    };
  };

  const normalizeTab = (x: any): Tab => {
    const itemsRaw = Array.isArray(x?.items)
      ? x.items
      : Array.isArray(x?.tab?.items)
      ? x.tab.items
      : [];
    const items = itemsRaw.map(normalizeTabItem);
    const base: Tab = {
      id: String(x?._id ?? x?.id ?? x?.tab?._id ?? x?.tab?.id ?? ""),
      name: String(x?.name ?? x?.tab?.name ?? ""),
      status: String(x?.status ?? x?.tab?.status ?? "OPEN") as any,
      user_id: x?.user_id ?? x?.tab?.user_id ?? null,
      notes: x?.notes ?? x?.tab?.notes ?? null,
      opened_at: String(
        x?.opened_at ??
          x?.openedAt ??
          x?.tab?.opened_at ??
          x?.tab?.openedAt ??
          new Date().toISOString()
      ),
      closed_at:
        x?.closed_at ??
        x?.closedAt ??
        x?.tab?.closed_at ??
        x?.tab?.closedAt ??
        null,
      items,
      totals: x?.totals
        ? {
            subtotal: toNum(x.totals.subtotal, 0),
            discount_total: toNum(x.totals.discount_total, 0),
            tax_total: toNum(x.totals.tax_total, 0),
            total: toNum(x.totals.total, 0),
          }
        : undefined,
    };
    if (!base.totals) base.totals = computeTabTotalsFromItems(base);
    return base;
  };

  /* ================= Derived maps ================= */
  const productsById = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) {
      if (!isAllowedForCatalog(p)) continue;
      if (p.category) s.add(p.category);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const selectedTotals = useMemo<Totals>(() => {
    if (!selected) return { subtotal: 0, discount_total: 0, tax_total: 0, total: 0 };

    const invDisc = Math.max(0, Math.round(toNum(invoiceDiscountStr, 0)));
    const invIva =
      invoiceIVAStr.trim() === ""
        ? null
        : Math.max(0, Math.round(toNum(invoiceIVAStr, 0)));

    return computeTabTotalsWithInvoiceAdjust(selected, invDisc, invIva);
  }, [selected, invoiceDiscountStr, invoiceIVAStr]);

  /* Pagado y cambio del modal */
  const payPreview = useMemo(() => {
    const due = Math.max(0, Math.round(toNum(selectedTotals.total, 0)));
    const paid = (payLines || []).reduce((s, ln) => {
      const amt = Math.max(0, Math.round(toNum(ln.amountStr, 0)));
      return s + amt;
    }, 0);
    const change = Math.max(0, paid - due);
    return { due, paid, change };
  }, [payLines, selectedTotals.total]);

  /* Inicializa una línea de pago al abrir el modal */
  useEffect(() => {
    if (!confirmSaleOpen) return;
    setPayLines((prev) => {
      if (prev.length) return prev;
      const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const t = Math.max(0, Math.round(toNum(selectedTotals.total, 0)));
      return [{ id, method: "CASH", amountStr: String(t), provider: "NEQUI", reference: "" }];
    });
  }, [confirmSaleOpen, selectedTotals.total]);

  useEffect(() => {
    setInvoiceAdjOpen(false);
    setInvoiceDiscountStr("0");
    setInvoiceIVAStr("");
  }, [selected?.id]);

  const filteredCatalog = useMemo(() => {
    const q = pq.trim().toLowerCase();
    return products
      .filter((p) => isAllowedForCatalog(p))
      .filter((p) => (pcat ? p.category === pcat : true))
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, pq, pcat]);

  /* ================= Toast helper ================= */
  const flash = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 5200);
  };

  /* ================= Confirm modal helpers ================= */
  const openConfirm = (c: ConfirmState) => {
    setConfirmBusy(false);
    setConfirm(c);
  };

  const closeConfirm = () => {
    setConfirmBusy(false);
    setConfirm(null);
  };

  /* ================= State patch helpers (UI reactiva) ================= */
  const patchSelected = (fn: (t: Tab) => Tab, tabId?: string) => {
    setSelected((prev) => {
      if (!prev) return prev;
      if (tabId && prev.id !== tabId) return prev;
      const next = fn(prev);
      return { ...next, totals: computeTabTotalsFromItems(next) };
    });
  };

  const patchTabsOpen = (tabId: string, fn: (t: Tab) => Tab) => {
    setTabsOpen((prev) => prev.map((t) => (t.id === tabId ? fn(t) : t)));
  };

  const removeSelectedItemLocal = (tabId: string, itemId: string) => {
    patchSelected(
      (t) => {
        if (t.id !== tabId) return t;
        const items = (t.items || []).filter((it) => it.id !== itemId);
        return { ...t, items };
      },
      tabId
    );

    setQtyDrafts((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const clearQtyTimer = (itemId: string) => {
    const t = qtyTimers.current[itemId];
    if (!t) return;
    window.clearTimeout(t);
    delete qtyTimers.current[itemId];
  };

  const setItemQtyLocal = (tabId: string, itemId: string, qty: number) => {
    patchSelected(
      (t) => {
        if (t.id !== tabId) return t;
        const items = (t.items || []).map((curr) => {
          if (curr.id !== itemId) return curr;
          const local = calcLineLocal(
            qty,
            curr.unit_price,
            curr.line_discount,
            curr.tax_rate
          );
          return { ...curr, qty, tax_amount: local.tax_amount, line_total: local.line_total };
        });
        return { ...t, items };
      },
      tabId
    );
  };

  /* ================= Auth bootstrap ================= */
  useEffect(() => {
    const t = getToken();
    if (!t) {
      nav("/login");
      return;
    }
    let alive = true;
    (async () => {
      setLoading(true);
      setMsg("");
      const r = await authMe();
      if (!alive) return;
      if (!r.ok) {
        setToken(null);
        nav("/login");
        return;
      }
      setMe((r as any).user || (r as any).data || null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [nav]);

  /* ================= Load products ================= */
  const loadProducts = async () => {
    setLoadingProducts(true);
    setMsg("");
    const r = await productsList("");
    if (!r.ok) {
      setLoadingProducts(false);
      setMsg(r.error || "No se pudieron cargar productos");
      return;
    }
    const raw = Array.isArray((r as any).items)
      ? (r as any).items
      : Array.isArray((r as any).data)
      ? (r as any).data
      : [];
    setProducts(raw.map(normalizeProduct));
    setLoadingProducts(false);
  };

  /* ================= Load tabs ================= */
  const loadTabs = async (status: "OPEN" | "CLOSED" | "ALL") => {
    setLoading(true);
    setMsg("");
    const r = await tabsListOnline(status);
    if (!r.ok) {
      setLoading(false);
      setMsg(r.error || "No se pudieron cargar mesas");
      return;
    }

    const raw = Array.isArray((r as any).items)
      ? (r as any).items
      : Array.isArray((r as any).data)
      ? (r as any).data
      : [];
    const tabs = raw.map(normalizeTab);

    const open = tabs.filter((t: Tab) => t.status === "OPEN");
    const closed = tabs.filter((t: Tab) => t.status === "CLOSED");

    setTabsOpen(open);
    setTabsClosed(closed);
    setLoading(false);
  };

  /* ================= Load one tab ================= */
  const loadOne = async (id: string) => {
    setLoadingOne(true);
    setMsg("");
    const r = await tabsGetOnline(id);
    setLoadingOne(false);

    if (!r.ok) {
      setMsg(r.error || "No se pudo cargar detalle");
      return;
    }

    const baseTab = (r as any).tab ?? (r as any).item ?? (r as any).data ?? null;
    const extraItems = Array.isArray((r as any).items) ? (r as any).items : null;
    const extraTotals = (r as any).totals ?? null;

    const merged = baseTab
      ? {
          ...baseTab,
          ...(extraItems ? { items: extraItems } : null),
          ...(extraTotals ? { totals: extraTotals } : null),
        }
      : extraItems
      ? { ...(r as any), items: extraItems }
      : (r as any);

    const t = normalizeTab(merged);
    setSelected(t);
    setNameDraft(t.name);
    setNoteDraft(t.notes || "");
    setQtyDrafts(() => {
      const d: Record<string, string> = {};
      for (const it of t.items || []) d[it.id] = String(toNum(it.qty, 0));
      return d;
    });
  };

  /* ================= Reservation summary ================= */
  const loadReservedAllOpen = async () => {
    const r = await tabsReservationsSummary("OPEN");
    if (!r.ok) return;

    const m = new Map<string, number>();
    const items = Array.isArray((r as any).items) ? (r as any).items : [];
    for (const it of items) {
      const id = String((it as any).product_id || "");
      if (!id) continue;
      m.set(id, (m.get(id) || 0) + toNum((it as any).reserved_qty, 0));
    }
    setReservedAllOpen(m);
  };

  /* ================= Unit conversions ================= */
  const stockCanonical = (p: Product): number => {
    const v =
      p.stock_available !== undefined
        ? toNum(p.stock_available, 0)
        : toNum(p.stock, 0);
    return Math.max(0, v);
  };

  const stockBaseUnit = (p: Product): number => {
    const m = String(p.measure || "").toLowerCase();
    const v = stockCanonical(p);
    if (m.includes("l")) return v * 1000;
    if (m.includes("ml")) return v;
    if (m.includes("kg")) return v * 1000;
    if (m.includes("g")) return v;
    return v;
  };

  const qtyBaseUnit = (
    qty: number,
    unit: string | null | undefined,
    ingredientMeasure: string | null | undefined
  ): number => {
    const u = String(unit || ingredientMeasure || "").toLowerCase();
    const q = Math.max(0, toNum(qty, 0));
    if (u.includes("l")) return q * 1000;
    if (u.includes("ml")) return q;
    if (u.includes("kg")) return q * 1000;
    if (u.includes("g")) return q;
    return q;
  };

  /* ================= Cocktail availability ================= */
  const getRecipe = async (cocktailId: string): Promise<RecipeItem[]> => {
    if (recipeCache.current[cocktailId]) return recipeCache.current[cocktailId];

    const r = await recipeGetOnline(cocktailId);
    if (!r.ok) {
      recipeCache.current[cocktailId] = [];
      return [];
    }

    const raw = Array.isArray((r as any).items)
      ? (r as any).items
      : Array.isArray((r as any).data)
      ? (r as any).data
      : [];
    const items: RecipeItem[] = raw.map(normRecipeItem).filter(Boolean) as any;
    recipeCache.current[cocktailId] = items;
    return items;
  };

  const recomputeCocktailAvail = async (catalog: Product[]) => {
    const out: Record<string, number> = {};
    for (const p of catalog) {
      const kind = String(p.kind || "").toUpperCase();
      if (kind !== "COCKTAIL") continue;

      const recipe = await getRecipe(p.id);
      if (!recipe.length) {
        out[p.id] = 0;
        continue;
      }

      let limit = Number.POSITIVE_INFINITY;

      for (const ri of recipe) {
        const ing = productsById.get(ri.ingredient_id);
        if (!ing) {
          limit = 0;
          break;
        }

        const ingStock = stockBaseUnit(ing);
        const need = qtyBaseUnit(ri.qty, ri.unit, ri.ingredient_measure);

        if (need <= 0) continue;

        const max = Math.floor(ingStock / need);
        limit = Math.min(limit, max);
      }

      out[p.id] = Number.isFinite(limit) ? Math.max(0, limit) : 0;
    }
    setCocktailAvail(out);
  };

  /* ================= Initial loads ================= */
  useEffect(() => {
    let alive = true;
    (async () => {
      await loadProducts();
      if (!alive) return;
      await loadTabs("OPEN");
      if (!alive) return;
      await loadReservedAllOpen();
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const catalog = products.filter(isAllowedForCatalog);
    if (!catalog.length) return;
    (async () => {
      await recomputeCocktailAvail(catalog);
    })();
  }, [productsById, products]);

  /* ================= Header actions ================= */
  const onGoHome = () => {
    nav("/dashboard");
  };

  const openHistory = async () => {
    setUiView("CLOSED");
    await loadTabs("CLOSED");
  };

  const openAbiertas = async () => {
    setUiView("MAP");
    await loadTabs("OPEN");
  };

  /* ================= Map helpers ================= */
  const parseSlotIndex = (name: string): number => {
    const m = name.match(/(\d+)/);
    return m ? toNum(m[1], 0) : 0;
  };

  const slots = useMemo(() => {
    const open = tabsOpen.filter((t) => {
      const isBar = t.name.toLowerCase().includes("barra");
      return placeType === "BARRA" ? isBar : !isBar;
    });

    const maxN = Math.max(
      1,
      ...open.map((t) => parseSlotIndex(t.name)).filter((n) => n > 0),
      placeType === "BARRA" ? 8 : 17
    );

    const arr: { name: string; openTab: Tab | null }[] = [];
    for (let i = 1; i <= maxN; i++) {
      const label = `${placeType === "BARRA" ? "Barra" : "Mesa"} ${i}`;
      const t = open.find((x) => x.name.toLowerCase() === label.toLowerCase()) || null;
      arr.push({ name: label, openTab: t });
    }
    return arr;
  }, [tabsOpen, placeType]);

  const openNextSlot = async () => {
    setCreateNumberStr("");
    setCreateOpen(true);
  };

  /* ================= Confirm actions (no browser dialogs) ================= */
  const requestOpenSlot = (slotName: string) => {
    openConfirm({
      kind: "OPEN_SLOT",
      title: `Abrir ${slotName}`,
      body: `¿Deseas abrir ${slotName}?`,
      confirmText: "Abrir",
      payload: { slotName },
    });
  };

  const doOpenSlot = async (slotName: string) => {
    const r = await tabsCreateOnline({ name: slotName });
    if (!r.ok) {
      setMsg(r.error || "No se pudo abrir");
      return;
    }

    const tabRaw = (r as any).tab ?? (r as any).item ?? (r as any).data ?? r;
    const t = normalizeTab(tabRaw);

    await loadTabs("OPEN");
    await loadReservedAllOpen();

    await loadOne(t.id);
    setUiView("DETAIL");
    flash(`${slotName} abierta`);
  };

  const enterSlot = async (t: Tab) => {
    await loadOne(t.id);
    setUiView("DETAIL");
  };

  /* ================= Detail actions ================= */
  const backToMap = async () => {
    setSelected(null);
    setUiView("MAP");
    await loadTabs("OPEN");
    await loadReservedAllOpen();
  };

  /* Cierra la mesa sin generar venta */
  const requestCloseTabOnly = () => {
    if (!selected || selected.status !== "OPEN") return;
    openConfirm({
      kind: "CLOSE_TAB_ONLY",
      title: "Cerrar mesa",
      body: "¿Cerrar la mesa sin generar venta?",
      confirmText: "Cerrar mesa",
      danger: true,
      payload: { tabId: selected.id },
    });
  };

  const doCloseTabOnly = async (tabId: string) => {
    const sel = selectedRef.current;
    if (!sel || sel.id !== tabId) return;

    const r = await tabsCloseOnline(tabId);
    if (!r.ok) {
      setMsg(r.error || "No se pudo cerrar la mesa");
      return;
    }

    flash("Mesa cerrada");
    setSelected(null);
    setUiView("MAP");
    await loadTabs("OPEN");
    await loadReservedAllOpen();
  };

  const saveRename = async () => {
    if (!selected) return;
    const name = nameDraft.trim();
    if (!name) return;

    const prevName = selected.name;

    patchSelected((t) => ({ ...t, name }));
    patchTabsOpen(selected.id, (t) => ({ ...t, name }));

    const r = await tabsRenameOnline(selected.id, name);
    if (!r.ok) {
      patchSelected((t) => ({ ...t, name: prevName }));
      patchTabsOpen(selected.id, (t) => ({ ...t, name: prevName }));
      setMsg(r.error || "No se pudo renombrar");
      return;
    }

    flash("Nombre guardado");
  };

  const saveNote = async () => {
    if (!selected) return;
    const prev = selected.notes || "";
    const next = noteDraft || "";

    patchSelected((t) => ({ ...t, notes: next }));

    const r = await tabsSetNoteOnline(selected.id, next);
    if (!r.ok) {
      patchSelected((t) => ({ ...t, notes: prev }));
      setMsg(r.error || "No se pudo guardar nota");
      return;
    }

    flash("Nota guardada");
  };

  const requestClearTab = () => {
    if (!selected || selected.status !== "OPEN") return;
    openConfirm({
      kind: "CLEAR_TAB",
      title: "Vaciar mesa",
      body: "¿Vaciar la mesa?",
      confirmText: "Vaciar",
      danger: true,
      payload: { tabId: selected.id },
    });
  };

  const doClearTab = async (tabId: string) => {
    const sel = selectedRef.current;
    if (!sel || sel.id !== tabId) return;

    const r = await tabsClearOnline(tabId);
    if (!r.ok) {
      setMsg(r.error || "No se pudo vaciar");
      return;
    }

    patchSelected(
      (t) => {
        if (t.id !== tabId) return t;
        return { ...t, items: [] };
      },
      tabId
    );

    await loadReservedAllOpen();
    flash("Mesa vaciada");
  };

  const askDelete = () => {
    setDeleteOpen(true);
  };

  /* ================= Item qty handlers ================= */
  const focusQty = (itemId: string) => {
    const el = qtyRefs.current[itemId];
    if (!el) return;
    try {
      el.focus();
      el.select();
    } catch {}
  };

  /* Persiste item al backend y mantiene UI reactiva */
  const persistItemUpdate = async (
    tabId: string,
    itemId: string,
    nextQty: number,
    nextDisc?: number,
    nextTaxRate?: number | null
  ) => {
    const sel = selectedRef.current;
    if (!sel || sel.id !== tabId) return;

    const it = (sel.items || []).find((x) => x.id === itemId);
    if (!it) return;

    const qty = clamp(Math.max(0, Math.round(toNum(nextQty, 0))), 0, 9999);
    const disc =
      nextDisc !== undefined
        ? Math.max(0, Math.round(toNum(nextDisc, 0)))
        : Math.max(0, Math.round(toNum(it.line_discount, 0)));
    const taxRate = nextTaxRate !== undefined ? nextTaxRate : it.tax_rate;

    const local = calcLineLocal(qty, it.unit_price, disc, taxRate);

    patchSelected(
      (t) => {
        if (t.id !== tabId) return t;
        const items = (t.items || []).map((curr) =>
          curr.id === itemId
            ? {
                ...curr,
                qty,
                line_discount: disc,
                tax_rate: taxRate,
                tax_amount: local.tax_amount,
                line_total: local.line_total,
              }
            : curr
        );
        return { ...t, items };
      },
      tabId
    );

    setQtyDrafts((prev) => ({ ...prev, [itemId]: String(qty) }));

    const r = await tabsUpdateItemOnline(itemId, {
      qty,
      unit_price: it.unit_price,
      line_discount: disc,
      tax_rate: taxRate,
    });

    if (!r.ok) {
      setMsg(r.error || "No se pudo actualizar");
      await loadOne(tabId);
      await loadReservedAllOpen();
      return;
    }

    const rawItem = (r as any).item ?? (r as any).data ?? null;
    if (rawItem) {
      const norm = normalizeTabItem(rawItem);
      patchSelected(
        (t) => {
          if (t.id !== tabId) return t;
          const items = (t.items || []).map((curr) =>
            curr.id === itemId ? norm : curr
          );
          return { ...t, items };
        },
        tabId
      );
      setQtyDrafts((prev) => ({ ...prev, [itemId]: String(norm.qty) }));
    }

    await loadReservedAllOpen();
  };

  const scheduleQtyPersist = (tabId: string, itemId: string, qty: number) => {
    clearQtyTimer(itemId);
    qtyTimers.current[itemId] = window.setTimeout(async () => {
      const sel = selectedRef.current;
      if (!sel || sel.id !== tabId) return;

      const last = lastQtySent.current[itemId];
      if (last !== undefined && last === qty) return;

      lastQtySent.current[itemId] = qty;
      await persistItemUpdate(tabId, itemId, qty);
    }, 380);
  };

  const commitQtyNow = async (tabId: string, itemId: string) => {
    clearQtyTimer(itemId);
    const sel = selectedRef.current;
    const it = sel?.items?.find((x) => x.id === itemId) || null;
    if (!it || sel?.id !== tabId) return;

    const draft = qtyDrafts[itemId] ?? String(it.qty);
    const clean = String(draft || "").replace(/[^\d]/g, "");
    const next = clamp(parseInt(clean || "0", 10) || 0, 0, 9999);

    lastQtySent.current[itemId] = next;
    await persistItemUpdate(tabId, itemId, next);
  };

  const requestRemoveItem = (it: TabItem) => {
    if (!selected || selected.status !== "OPEN") return;
    const p = productsById.get(it.product_id);
    const name = it.name_snapshot || p?.name || "Producto";

    openConfirm({
      kind: "REMOVE_ITEM",
      title: "Quitar producto",
      body: `¿Quitar "${name}" de la mesa?`,
      confirmText: "Quitar",
      danger: true,
      payload: { tabId: selected.id, itemId: it.id },
    });
  };

  const doRemoveItem = async (tabId: string, itemId: string) => {
    const sel = selectedRef.current;
    if (!sel || sel.id !== tabId) return;

    removeSelectedItemLocal(tabId, itemId);

    const r = await tabsRemoveItemOnline(itemId);
    if (!r.ok) {
      setMsg(r.error || "No se pudo quitar");
      await loadOne(tabId);
      await loadReservedAllOpen();
      return;
    }

    await loadReservedAllOpen();
    flash("Producto quitado");
  };

  /* ================= Catalog availability ================= */
  const qtyInTab = (productId: string) => {
    const items = selected?.items || [];
    let s = 0;
    for (const it of items) {
      if (it.product_id === productId) s += toNum(it.qty, 0);
    }
    return s;
  };

  const availability = (p: Product) => {
    const kind = String(p.kind || "").toUpperCase();
    if (kind === "COCKTAIL") return toNum(cocktailAvail[p.id], 0);

    const base = stockCanonical(p);
    const reserved = reservedAllOpen.get(p.id) || 0;
    return Math.max(0, base - reserved);
  };

  const isLow = (p: Product, disp: number) => {
    const kind = String(p.kind || "").toUpperCase();
    if (kind === "COCKTAIL") return disp > 0 && disp <= 2;
    return disp > 0 && disp <= Math.max(0, toNum(p.min_stock, 0));
  };

  /* Agrega y pinta en UI usando la respuesta, sin recargar el detalle */
  const addFromCatalog = async (p: Product) => {
    if (!selected || selected.status !== "OPEN") return;

    const disp = availability(p);
    if (disp <= 0) return;

    const r = await tabsAddItemOnline(selected.id, {
      productId: p.id,
      qty: 1,
      unit_price: p.price,
    });

    if (!r.ok) {
      setMsg(r.error || "No se pudo agregar");
      return;
    }

    const rawItem = (r as any).item ?? (r as any).data ?? null;
    if (rawItem) {
      const it = normalizeTabItem(rawItem);
      patchSelected(
        (t) => ({ ...t, items: [...(t.items || []), it] }),
        selected.id
      );
      setQtyDrafts((prev) => ({ ...prev, [it.id]: String(it.qty) }));
      lastQtySent.current[it.id] = it.qty;
    } else {
      await loadOne(selected.id);
    }

    await loadReservedAllOpen();
  };

  /* ================= View: closed list ================= */
  const closedList = useMemo(() => {
    const isBar = placeType === "BARRA";
    return tabsClosed
      .filter((t) => {
        const b = t.name.toLowerCase().includes("barra");
        return isBar ? b : !b;
      })
      .sort(
        (a, b) =>
          new Date(b.closed_at || b.opened_at).getTime() -
          new Date(a.closed_at || a.opened_at).getTime()
      );
  }, [tabsClosed, placeType]);

  /* ================= Reopen confirm ================= */
  const requestReopen = () => {
    if (!selected || selected.status !== "CLOSED") return;
    openConfirm({
      kind: "REOPEN_TAB",
      title: "Reabrir mesa",
      body: "¿Reabrir esta mesa?",
      confirmText: "Reabrir",
      payload: { tabId: selected.id },
    });
  };

  const doReopen = async (tabId: string) => {
    const r = await tabsReopenOnline(tabId);
    if (!r.ok) {
      setMsg(r.error || "No se pudo reabrir");
      return;
    }

    await loadTabs("OPEN");
    await loadReservedAllOpen();
    await loadOne(tabId);
    flash("Mesa reabierta");
  };

  /* ================= Confirm router ================= */
  const runConfirm = async () => {
    if (!confirm || confirmBusy) return;
    setConfirmBusy(true);
    setMsg("");

    try {
      if (confirm.kind === "OPEN_SLOT") {
        await doOpenSlot(String(confirm.payload?.slotName || ""));
      } else if (confirm.kind === "CLOSE_TAB_ONLY") {
        await doCloseTabOnly(String(confirm.payload?.tabId || ""));
      } else if (confirm.kind === "CLEAR_TAB") {
        await doClearTab(String(confirm.payload?.tabId || ""));
      } else if (confirm.kind === "REMOVE_ITEM") {
        await doRemoveItem(
          String(confirm.payload?.tabId || ""),
          String(confirm.payload?.itemId || "")
        );
      } else if (confirm.kind === "REOPEN_TAB") {
        await doReopen(String(confirm.payload?.tabId || ""));
      }
    } finally {
      setConfirmBusy(false);
      closeConfirm();
    }
  };

  /* ================= Render ================= */
  return (
    <div className="st-root">
      <style>{css}</style>

      {toast ? (
        <div className="toast">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <b>{toast}</b>
            <button className="btn btn-animate btn-ghost" type="button" onClick={() => setToast("")}>
              Cerrar
            </button>
          </div>
          <div className="toastBar">
            <span />
          </div>
        </div>
      ) : null}

      <div className="st-shell">
        <div className="st-head">
          <div className="st-head-left">
            <button className="st-home btn-animate" type="button" onClick={onGoHome} title="Home">
              <IHome />
            </button>

            <div className="st-titlebox">
              <p className="st-title">MESAS</p>
              <p className="st-sub">Control de reservas</p>
            </div>
          </div>

          <div className="st-actions">
            <span className={`pill ${uiView === "MAP" ? "pill-active" : ""}`}>Abiertas</span>

            <button
              className={`btn btn-animate ${uiView === "CLOSED" ? "btn-primary" : ""}`}
              type="button"
              onClick={openHistory}
              title="Historial"
            >
              Historial
            </button>

            <div className="seg" role="tablist" aria-label="Tipo">
              <button
                type="button"
                className={placeType === "MESA" ? "active" : ""}
                onClick={() => setPlaceType("MESA")}
                aria-pressed={placeType === "MESA"}
              >
                <ITable />
                Mesas
              </button>
              <button
                type="button"
                className={placeType === "BARRA" ? "active" : ""}
                onClick={() => setPlaceType("BARRA")}
                aria-pressed={placeType === "BARRA"}
              >
                <IBar />
                Barras
              </button>
            </div>

            <button
              className="btn btn-primary btn-animate"
              type="button"
              onClick={openNextSlot}
              title={placeType === "BARRA" ? "Abrir nueva barra" : "Abrir nueva mesa"}
            >
              {placeType === "BARRA" ? "Abrir nueva barra" : "Abrir nueva mesa"}
            </button>
          </div>
        </div>

        {msg ? (
          <div className="card" style={{ padding: 12, marginBottom: 12, borderColor: "rgba(239,68,68,0.30)" }}>
            <b style={{ color: "#b91c1c" }}>{msg}</b>
          </div>
        ) : null}

        {loading ? (
          <div className="card" style={{ padding: 18 }}>
            <b>Cargando...</b>
          </div>
        ) : null}
        {!loading && uiView === "MAP" ? (
          <div className="card cardfx">
            <div className="card-hd">
              <p className="card-title">{placeType === "BARRA" ? "Mapa de barras" : "Mapa de mesas"}</p>
              <p className="card-sub">Toca una tarjeta para abrir o entrar al detalle.</p>
            </div>

            <div className="map-grid">
              {slots.map((s) => {
                const t = s.openTab;
                const open = !!t;
                return (
                  <div
                    key={s.name}
                    className="slot cardfx"
                    onClick={async () => {
                      if (t) {
                        await enterSlot(t);
                        return;
                      }
                      requestOpenSlot(s.name);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <p className="slot-name">{s.name}</p>

                    {open ? (
                      <>
                        <p className="slot-meta">Desde: {fmtTimeAMPM(t!.opened_at)}</p>
                        <span className="badge badge-open">Abierta</span>
                      </>
                    ) : (
                      <span className="badge">Libre</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {!loading && uiView === "CLOSED" ? (
          <div className="card cardfx">
            <div className="card-hd">
              <p className="card-title">Historial</p>
              <p className="card-sub">Toca una tarjeta para ver el detalle.</p>
            </div>

            <div className="map-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
              {closedList.length ? (
                closedList.map((t) => (
                  <div
                    key={t.id}
                    className="slot cardfx"
                    onClick={async () => {
                      await loadOne(t.id);
                      setUiView("DETAIL");
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <p className="slot-name">{t.name}</p>
                    <p className="slot-meta">Cerrada: {fmtTimeAMPM(String(t.closed_at || t.opened_at))}</p>
                    <span className="badge">{COP.format(toNum(t.totals?.total, 0))}</span>
                  </div>
                ))
              ) : (
                <div style={{ padding: 18, gridColumn: "1 / -1" }}>
                  <b style={{ color: MUTED }}>No hay registros.</b>
                </div>
              )}
            </div>

            <div style={{ padding: "0 18px 18px" }}>
              <button className="btn btn-animate" type="button" onClick={openAbiertas}>
                Volver
              </button>
            </div>
          </div>
        ) : null}

        {!loading && uiView === "DETAIL" ? (
          <div className="split">
            <div>
              <div className="card cardfx">
                <div className="card-hd">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div>
                      <p className="card-title">Detalle Mesa</p>
                      <p className="card-sub">{selected?.name || ""}</p>
                    </div>

                    <button className="btn btn-animate" type="button" onClick={backToMap}>
                      Volver al mapa
                    </button>
                  </div>
                </div>

                <div className="card-bd">
                  {!selected ? (
                    <b style={{ color: MUTED }}>Selecciona una mesa.</b>
                  ) : (
                    <>
                      <div className="row">
                        <input
                          className="field"
                          value={nameDraft}
                          onChange={(e) => setNameDraft(e.target.value)}
                          placeholder={selected.name}
                        />

                        <button className="btn btn-animate btn-sm" type="button" onClick={requestCloseTabOnly}>
                          Cerrar
                        </button>

                        <button className="btn btn-primary btn-animate btn-sm" type="button" onClick={saveRename}>
                          Guardar
                        </button>
                      </div>

                      <div className="row" style={{ marginTop: 10 }}>
                        <input
                          className="field"
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="Notas para esta mesa"
                        />
                        <button className="btn btn-animate btn-sm" type="button" onClick={saveNote}>
                          Guardar nota
                        </button>
                      </div>

                      <div className="items-wrap">
                        <div className="items-head">
                          <div>Producto</div>
                          <div style={{ textAlign: "center" }}>Cant.</div>
                          <div style={{ textAlign: "right" }}>Acciones</div>
                        </div>

                        <div className="items-scroll">
                          {(selected.items || []).length ? (
                            (selected.items || []).map((it) => {
                              const p = productsById.get(it.product_id);
                              const name = it.name_snapshot || p?.name || "Producto";
                              const qty = toNum(it.qty, 0);
                              const draft = qtyDrafts[it.id] ?? String(qty);
                              const line = toNum(it.line_total, 0);
                              const tabId = selected.id;

                              return (
                                <div key={it.id} className="item-row">
                                  <div>
                                    <p className="pname">{name}</p>
                                    <p className="psub">Subtotal bruto: {COP.format(line)}</p>
                                    {toNum(it.line_discount, 0) > 0 ? (
                                      <p className="psub">Descuento: {COP.format(toNum(it.line_discount, 0))}</p>
                                    ) : null}
                                  </div>

                                  <div className="qtybox">
                                    <button
                                      className="qbtn btn-animate"
                                      type="button"
                                      onClick={async () => {
                                        clearQtyTimer(it.id);
                                        const next = Math.max(0, qty - 1);
                                        setQtyDrafts((prev) => ({ ...prev, [it.id]: String(next) }));
                                        lastQtySent.current[it.id] = next;
                                        await persistItemUpdate(tabId, it.id, next);
                                        focusQty(it.id);
                                      }}
                                    >
                                      -
                                    </button>

                                    <input
                                      ref={(el) => {
                                        qtyRefs.current[it.id] = el;
                                      }}
                                      className="qinput"
                                      value={draft}
                                      onChange={(e) => {
                                        const raw = String(e.target.value || "").replace(/[^\d]/g, "");
                                        setQtyDrafts((prev) => ({ ...prev, [it.id]: raw }));

                                        const next = clamp(parseInt(raw || "0", 10) || 0, 0, 9999);
                                        setItemQtyLocal(tabId, it.id, next);

                                        scheduleQtyPersist(tabId, it.id, next);
                                      }}
                                      onBlur={async () => {
                                        await commitQtyNow(tabId, it.id);
                                      }}
                                      onKeyDown={async (e) => {
                                        if (e.key === "Enter") {
                                          await commitQtyNow(tabId, it.id);
                                          focusQty(it.id);
                                        }
                                      }}
                                      inputMode="numeric"
                                    />

                                    <button
                                      className="qbtn btn-animate"
                                      type="button"
                                      onClick={async () => {
                                        clearQtyTimer(it.id);
                                        const next = qty + 1;
                                        setQtyDrafts((prev) => ({ ...prev, [it.id]: String(next) }));
                                        lastQtySent.current[it.id] = next;
                                        await persistItemUpdate(tabId, it.id, next);
                                        focusQty(it.id);
                                      }}
                                    >
                                      +
                                    </button>
                                  </div>

                                  <div className="actcol">
                                    <button
                                      className="btn btn-animate btn-sm"
                                      type="button"
                                      onClick={() => {
                                        setDiscountModalItem(it);
                                        setDiscountCOPStr(String(Math.max(0, toNum(it.line_discount, 0))));
                                        setDiscountIVAStr(it.tax_rate === null ? "" : String(toNum(it.tax_rate, 0)));
                                      }}
                                    >
                                      Descuento / IVA
                                    </button>

                                    <button
                                      className="btn btn-primary btn-animate btn-sm"
                                      type="button"
                                      onClick={() => {
                                        const pp = productsById.get(it.product_id) || null;
                                        setDetailModalProduct(pp);
                                        setDetailModalAddedAt(String(it.added_at || ""));
                                      }}
                                    >
                                      Ver detalles
                                    </button>

                                    <button className="btn btn-animate btn-sm" type="button" onClick={() => requestRemoveItem(it)}>
                                      Quitar
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div style={{ padding: "14px 0" }}>
                              <b style={{ color: MUTED }}>Mesa vacía.</b>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="card cardfx totals">
                <div className="totals-list">
                  <div>
                    Subtotal <b>{COP.format(selectedTotals.subtotal)}</b>
                  </div>
                  <div>
                    Descuento <b>{COP.format(selectedTotals.discount_total)}</b>
                  </div>
                  {Math.max(0, Math.round(toNum(invoiceDiscountStr, 0))) > 0 || invoiceIVAStr.trim() !== "" ? (
                    <div>
                      Desc. general{" "}
                      <b>
                        {COP.format(
                          selected
                            ? Math.min(
                                Math.max(0, Math.round(toNum(invoiceDiscountStr, 0))),
                                Math.round(computeTabTotalsFromItems(selected).subtotal || 0)
                              )
                            : Math.max(0, Math.round(toNum(invoiceDiscountStr, 0)))
                        )}
                      </b>
                    </div>
                  ) : null}

                  <div>
                    Impuestos <b>{COP.format(selectedTotals.tax_total)}</b>
                  </div>
                  <div style={{ fontSize: 16 }}>
                    Total <b>{COP.format(selectedTotals.total)}</b>
                  </div>
                </div>

                <div className="tot-actions">
                  <button
                    className="btn btn-animate"
                    type="button"
                    onClick={() => setInvoiceAdjOpen(true)}
                    disabled={!selected || selected.status !== "OPEN"}
                  >
                    Descuento general
                  </button>

                  <button className="btn btn-animate" type="button" onClick={requestClearTab} disabled={!selected || selected.status !== "OPEN"}>
                    Vaciar
                  </button>

                  <button
                    className="btn btn-primary btn-animate"
                    type="button"
                    onClick={() => {
                      const t = Math.max(0, Math.round(toNum(selectedTotals.total, 0)));
                      setPayLines([makePayLine({ method: "CASH", amountStr: String(t) })]);
                      setSaleNotes("");
                      setConfirmSaleOpen(true);
                    }}
                    disabled={!selected || selected.status !== "OPEN" || (selected.items || []).length === 0}
                  >
                    Generar venta
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {selected?.status === "OPEN" ? (
                  <button className="btn btn-danger btn-animate" type="button" onClick={askDelete}>
                    Eliminar mesa
                  </button>
                ) : (
                  <button className="btn btn-animate" type="button" onClick={requestReopen}>
                    Reabrir
                  </button>
                )}
              </div>
            </div>

            <div>
              <div className="card cardfx">
                <div className="card-hd">
                  <p className="card-title">Catálogo</p>
                  <p className="card-sub">Toca una tarjeta para agregar al pedido.</p>
                </div>

                <div className="card-bd">
                  <div className="cat-filters">
                    <div className="searchWrap">
                      <span className="searchIcon">
                        <ISearch />
                      </span>
                      <input
                        className="field searchInput"
                        value={pq}
                        onChange={(e) => setPq(e.target.value)}
                        placeholder="Buscar por nombre o categoría"
                      />
                    </div>

                    <select className="field" value={pcat} onChange={(e) => setPcat(e.target.value)}>
                      <option value="">Todas las categorías</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="cat-grid" style={{ maxHeight: 670, overflow: "auto", paddingRight: 6 }}>
                    {loadingProducts ? (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <b>Cargando...</b>
                      </div>
                    ) : filteredCatalog.length ? (
                      filteredCatalog.map((p) => {
                        const disp = availability(p);
                        const here = qtyInTab(p.id);
                        const low = isLow(p, disp);
                        const disabled = !selected || selected.status !== "OPEN" || disp <= 0;

                        return (
                          <div
                            key={p.id}
                            className={`pcard cardfx ${disabled ? "disabled" : ""}`}
                            onClick={async () => {
                              if (disabled) return;
                              await addFromCatalog(p);
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="pc-top">
                              <p className="pc-name">{p.name}</p>
                              <p className="pc-price">{COP.format(toNum(p.price, 0))}</p>
                            </div>

                            <p className="pc-cat">{p.category}</p>

                            <div className="pc-av">
                              <span>Disponible: {disp}</span>
                              <span>{here > 0 ? `(aquí: ${here})` : ""}</span>
                              {low ? <span className="badge badge-low">Bajo</span> : null}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <b style={{ color: MUTED }}>No hay productos.</b>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* ================= Modal Confirmación ================= */}
        {confirm ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              display: "grid",
              placeItems: "center",
              padding: 16,
              zIndex: 70,
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeConfirm();
            }}
          >
            <div className="card" style={{ width: "min(700px, 94vw)", padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 1000, fontSize: 16 }}>{confirm.title}</p>
                  <p style={{ margin: "4px 0 0", color: MUTED, fontWeight: 800, fontSize: 13 }}>{confirm.body}</p>
                </div>

                <button className="btn btn-animate" type="button" onClick={closeConfirm} disabled={confirmBusy}>
                  Cerrar
                </button>
              </div>

              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                <button className="btn btn-animate" type="button" onClick={closeConfirm} disabled={confirmBusy}>
                  Cancelar
                </button>

                <button
                  className={`btn btn-animate ${confirm.danger ? "btn-danger" : "btn-primary"}`}
                  type="button"
                  onClick={runConfirm}
                  disabled={confirmBusy}
                >
                  {confirmBusy ? "Procesando..." : confirm.confirmText}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {/* ================= Modal Descuento / IVA ================= */}
        {discountModalItem && selected ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              display: "grid",
              placeItems: "center",
              padding: 16,
              zIndex: 60,
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setDiscountModalItem(null);
            }}
          >
            <div className="card" style={{ width: "min(760px, 94vw)", padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 1000, fontSize: 16 }}>Descuento / IVA</p>
                  <p style={{ margin: "4px 0 0", color: MUTED, fontWeight: 800, fontSize: 13 }}>
                    Ajusta descuento en COP y/o IVA (%).
                  </p>
                </div>

                <button className="btn btn-animate" type="button" onClick={() => setDiscountModalItem(null)}>
                  Cerrar
                </button>
              </div>

              <div className="modal-grid" style={{ marginTop: 14 }}>
                <div>
                  <p style={{ margin: "0 0 6px", color: MUTED, fontWeight: 900, fontSize: 12 }}>Descuento (COP)</p>
                  <input
                    className="field"
                    value={discountCOPStr}
                    onChange={(e) => setDiscountCOPStr(e.target.value)}
                    inputMode="numeric"
                    placeholder="0"
                  />
                </div>

                <div>
                  <p style={{ margin: "0 0 6px", color: MUTED, fontWeight: 900, fontSize: 12 }}>IVA (%)</p>
                  <input
                    className="field"
                    value={discountIVAStr}
                    onChange={(e) => setDiscountIVAStr(e.target.value)}
                    inputMode="numeric"
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                <button className="btn btn-animate" type="button" onClick={() => setDiscountModalItem(null)}>
                  Cancelar
                </button>

                <button
                  className="btn btn-primary btn-animate"
                  type="button"
                  onClick={async () => {
                    if (!selected || !discountModalItem) return;

                    const disc = Math.max(0, Math.round(toNum(discountCOPStr, 0)));
                    const iva =
                      discountIVAStr.trim() === ""
                        ? null
                        : Math.max(0, Math.round(toNum(discountIVAStr, 0)));

                    clearQtyTimer(discountModalItem.id);
                    lastQtySent.current[discountModalItem.id] = discountModalItem.qty;

                    await persistItemUpdate(selected.id, discountModalItem.id, discountModalItem.qty, disc, iva);

                    setDiscountModalItem(null);
                    flash("Ajuste aplicado");
                  }}
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ================= Modal Descuento general ================= */}
        {invoiceAdjOpen && selected ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              display: "grid",
              placeItems: "center",
              padding: 16,
              zIndex: 60,
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setInvoiceAdjOpen(false);
            }}
          >
            <div className="card" style={{ width: "min(760px, 94vw)", padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 1000, fontSize: 16 }}>Descuento general</p>
                  <p style={{ margin: "4px 0 0", color: MUTED, fontWeight: 800, fontSize: 13 }}>
                    Ajusta descuento en COP y/o IVA (%) para toda la factura.
                  </p>
                </div>

                <button className="btn btn-animate" type="button" onClick={() => setInvoiceAdjOpen(false)}>
                  Cerrar
                </button>
              </div>

              <div className="modal-grid" style={{ marginTop: 14 }}>
                <div>
                  <p style={{ margin: "0 0 6px", color: MUTED, fontWeight: 900, fontSize: 12 }}>Descuento (COP)</p>
                  <input
                    className="field"
                    value={invoiceDiscountStr}
                    onChange={(e) => setInvoiceDiscountStr(e.target.value)}
                    inputMode="numeric"
                    placeholder="0"
                  />
                </div>

                <div>
                  <p style={{ margin: "0 0 6px", color: MUTED, fontWeight: 900, fontSize: 12 }}>IVA (%)</p>
                  <input
                    className="field"
                    value={invoiceIVAStr}
                    onChange={(e) => setInvoiceIVAStr(e.target.value)}
                    inputMode="numeric"
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                <button
                  className="btn btn-animate"
                  type="button"
                  onClick={() => {
                    setInvoiceDiscountStr("0");
                    setInvoiceIVAStr("");
                    setInvoiceAdjOpen(false);
                  }}
                >
                  Limpiar
                </button>

                <button className="btn btn-primary btn-animate" type="button" onClick={() => setInvoiceAdjOpen(false)}>
                  Guardar
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ================= Modal Ver detalles (receta) ================= */}
{detailModalProduct ? (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.35)",
      display: "grid",
      placeItems: "center",
      padding: 16,
      zIndex: 60,
    }}
    onMouseDown={(e) => {
      if (e.target === e.currentTarget) {
        setDetailModalProduct(null);
        setDetailModalAddedAt("");
      }
    }}
  >
    <div className="card" style={{ width: "min(860px, 94vw)", padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div>
          <p style={{ margin: 0, fontWeight: 1000, fontSize: 16 }}>Detalles</p>
          <p
            style={{
              margin: "4px 0 0",
              color: MUTED,
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            {detailModalProduct.name}
          </p>
        </div>

        <button
          className="btn btn-animate"
          type="button"
          onClick={() => {
            setDetailModalProduct(null);
            setDetailModalAddedAt("");
          }}
        >
          Cerrar
        </button>
      </div>

      {detailModalAddedAt ? (
        <div style={{ marginTop: 14 }}>
          <p style={{ margin: "0 0 6px", color: MUTED, fontWeight: 900, fontSize: 12 }}>
            Agregado
          </p>
          <div className="pill">{fmtDateTimeDMY(detailModalAddedAt)}</div>
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <p style={{ margin: "0 0 6px", color: MUTED, fontWeight: 900, fontSize: 12 }}>
          Categoría
        </p>
        <div className="pill">{detailModalProduct.category}</div>
      </div>

      <div style={{ marginTop: 12 }}>
        <p style={{ margin: "0 0 6px", color: MUTED, fontWeight: 900, fontSize: 12 }}>
          Precio
        </p>
        <div className="pill">{COP.format(toNum(detailModalProduct.price, 0))}</div>
      </div>

      <div style={{ marginTop: 12 }}>
        <p style={{ margin: "0 0 6px", color: MUTED, fontWeight: 900, fontSize: 12 }}>
          Receta (si aplica)
        </p>
        <RecipeInline product={detailModalProduct} getRecipe={getRecipe} productsById={productsById} />
      </div>
    </div>
  </div>
) : null}


        {/* ================= Modal cerrar venta ================= */}
        {confirmSaleOpen && selected ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              display: "grid",
              placeItems: "center",
              padding: 16,
              zIndex: 60,
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setConfirmSaleOpen(false);
            }}
          >
            <div className="card" style={{ width: "min(920px, 94vw)", padding: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 1000, fontSize: 16 }}>Cerrar venta</p>
                  <p
                    style={{
                      margin: "4px 0 0",
                      color: MUTED,
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    Mesa: <b style={{ color: TEXT }}>{selected.name}</b> · Total:{" "}
                    <b style={{ color: TEXT }}>{COP.format(selectedTotals.total || 0)}</b>
                  </p>
                </div>

                <button className="btn btn-animate" type="button" onClick={() => setConfirmSaleOpen(false)}>
                  Cerrar
                </button>
              </div>

              <div style={{ marginTop: 14 }}>
                <p style={{ margin: "0 0 8px", color: MUTED, fontWeight: 900, fontSize: 12 }}>
                  Pago
                </p>

                <div style={{ display: "grid", gap: 10 }}>
                  {payLines.map((ln) => (
                    <div key={ln.id} className="payRow">
                      <div>
                        <select
                          className="field"
                          value={ln.method}
                          onChange={(e) => {
                            const next = e.target.value as PayMethod;
                            setPayLines((prev) =>
                              prev.map((p) => (p.id === ln.id ? { ...p, method: next } : p))
                            );
                          }}
                        >
                          <option value="CASH">Efectivo</option>
                          <option value="CARD">Tarjeta</option>
                          <option value="TRANSFER">Transferencia</option>
                          <option value="OTHER">Otro</option>
                        </select>
                      </div>

                      <div>
                        <input
                          className="field"
                          value={ln.amountStr}
                          onChange={(e) => {
                            const v = e.target.value;
                            setPayLines((prev) =>
                              prev.map((p) => (p.id === ln.id ? { ...p, amountStr: v } : p))
                            );
                          }}
                          inputMode="numeric"
                          placeholder="0"
                        />
                      </div>

                      <div>
                        <div className="payRefRow">
                          {ln.method === "TRANSFER" ? (
                            <select
                              className="field"
                              value={ln.provider}
                              onChange={(e) => {
                                const v = e.target.value as TransferProvider;
                                setPayLines((prev) =>
                                  prev.map((p) => (p.id === ln.id ? { ...p, provider: v } : p))
                                );
                              }}
                              style={{ maxWidth: 150 }}
                            >
                              <option value="NEQUI">NEQUI</option>
                              <option value="DAVIPLATA">DAVIPLATA</option>
                            </select>
                          ) : null}

                          <input
                            className="field"
                            value={ln.reference}
                            onChange={(e) => {
                              const v = e.target.value;
                              setPayLines((prev) =>
                                prev.map((p) => (p.id === ln.id ? { ...p, reference: v } : p))
                              );
                            }}
                            placeholder="Referencia"
                          />
                        </div>
                      </div>

                      <button
                        className="btn btn-animate"
                        type="button"
                        disabled={payLines.length === 1}
                        onClick={() => {
                          setPayLines((prev) => {
                            if (prev.length <= 1) return prev;
                            return prev.filter((p) => p.id !== ln.id);
                          });
                        }}
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-animate"
                    type="button"
                    onClick={() => {
                      setPayLines((prev) => [...prev, makePayLine()]);
                    }}
                  >
                    Añadir pago
                  </button>

                  <button
                    className="btn btn-animate"
                    type="button"
                    onClick={() => {
                      const t = Math.max(0, Math.round(toNum(selectedTotals.total, 0)));
                      setPayLines([makePayLine({ method: "CASH", amountStr: String(t), reference: "" })]);
                    }}
                  >
                    Efectivo exacto
                  </button>
                </div>
              </div>

              <div className="payCards">
                <div className="card" style={{ padding: 12 }}>
                  <p style={{ margin: "0 0 6px", color: MUTED, fontWeight: 900, fontSize: 12 }}>Pagado</p>
                  <div style={{ margin: 0, fontWeight: 1000, fontSize: 16 }}>
                    {COP.format(payPreview.paid)}
                  </div>
                </div>

                <div className="card" style={{ padding: 12 }}>
                  <p style={{ margin: "0 0 6px", color: MUTED, fontWeight: 900, fontSize: 12 }}>Cambio</p>
                  <div style={{ margin: 0, fontWeight: 1000, fontSize: 16 }}>
                    {COP.format(payPreview.change)}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <p style={{ margin: "0 0 6px", color: MUTED, fontWeight: 900, fontSize: 12 }}>Notas de venta</p>
                <input
                  className="field"
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  placeholder="Opcional"
                />
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="btn btn-animate"
                  type="button"
                  onClick={() => setConfirmSaleOpen(false)}
                >
                  Cancelar
                </button>

                <button
                  className="btn btn-primary btn-animate"
                  type="button"
                  onClick={async () => {
                    if (!selected) return;

                    const normalized = (payLines || []).map((ln) => {
                      const amount = Math.max(0, Math.round(toNum(ln.amountStr, 0)));
                      const reference = String(ln.reference || "").trim();
                      const provider = ln.provider;
                      const method = ln.method;
                      return { method, amount, provider, reference };
                    });

                    const payTotal = normalized.reduce((s, p) => s + Math.max(0, toNum(p.amount, 0)), 0);
                    if (payTotal <= 0) {
                      setMsg("El total pagado debe ser mayor a 0");
                      return;
                    }

                    const payments: Payment[] = normalized
                      .filter((p) => p.amount > 0)
                      .map((p) => {
                        const out: Payment = { method: p.method, amount: p.amount };
                        if (p.method === "TRANSFER") out.provider = p.provider;
                        if (p.reference) out.reference = p.reference;
                        return out;
                      });

                    const invDisc = Math.max(0, Math.round(toNum(invoiceDiscountStr, 0)));
                    const invIva =
                      invoiceIVAStr.trim() === ""
                        ? null
                        : Math.max(0, Math.round(toNum(invoiceIVAStr, 0)));

                    const rawItems = (selected.items || []).map((it) => ({
                      product_id: it.product_id,
                      qty: it.qty,
                      unit_price: it.unit_price,
                      line_discount: it.line_discount,
                      tax_rate: it.tax_rate,
                    }));

                    const totalBase = rawItems.reduce((s, it) => {
                      const gross = Math.max(0, toNum(it.unit_price, 0) * toNum(it.qty, 0));
                      const base = Math.max(0, gross - Math.max(0, toNum(it.line_discount, 0)));
                      return s + base;
                    }, 0);

                    const baseTotals = computeTabTotalsFromItems(selected);
                    const discToApply = Math.max(
                      0,
                      Math.min(invDisc, Math.round(baseTotals.subtotal || 0))
                    );
                    let remainingDisc = discToApply;

                    const items = rawItems.map((it, idx) => {
                      const gross = Math.max(0, toNum(it.unit_price, 0) * toNum(it.qty, 0));
                      const currentDisc = Math.max(0, toNum(it.line_discount, 0));
                      const base = Math.max(0, gross - currentDisc);

                      let extraDisc = 0;
                      if (discToApply > 0 && totalBase > 0) {
                        if (idx === rawItems.length - 1) extraDisc = remainingDisc;
                        else {
                          extraDisc = Math.round((discToApply * base) / totalBase);
                          extraDisc = Math.max(0, Math.min(extraDisc, remainingDisc));
                        }
                      }

                      remainingDisc = Math.max(0, remainingDisc - extraDisc);

                      const nextDisc = Math.max(0, Math.min(gross, currentDisc + extraDisc));

                      return {
                        product_id: it.product_id,
                        qty: it.qty,
                        unit_price: it.unit_price,
                        line_discount: nextDisc,
                        tax_rate: invIva !== null ? invIva : it.tax_rate,
                      };
                    });

                    // Calcula totales requeridos por backend
const subtotal = items.reduce((acc: number, it: any) => {
  const qty = Number(it.qty || 0);
  const unit = Number(it.unit_price ?? it.unitPrice ?? it.price ?? 0);
  return acc + qty * unit;
}, 0);

const discount_total = items.reduce((acc: number, it: any) => {
  return acc + Number(it.line_discount ?? it.lineDiscount ?? 0);
}, 0);

const tax_total = items.reduce((acc: number, it: any) => {
  return acc + Number(it.tax ?? 0);
}, 0);

const total = subtotal - discount_total + tax_total;


                   const payload = {
                    status: "COMPLETED",
                    client: selected.name,
                    tab_id: selected.id,
                    tab_name: selected.name,
                    notes: saleNotes || "",
                    subtotal: Math.round(subtotal),
                    discount_total: Math.round(discount_total),
                    tax_total: Math.round(tax_total),
                     total: Math.round(total),
                     items: items,
                    payments,
                             };



                    const r = await salesCreateOnline(payload);
                    if (!r.ok) {
                      setMsg(r.error || "No se pudo crear la venta");
                      return;
                    }

                    await tabsCloseOnline(selected.id);

                    setConfirmSaleOpen(false);
                    setPayLines([]);
                    setSaleNotes("");
                    setInvoiceAdjOpen(false);
                    setInvoiceDiscountStr("0");
                    setInvoiceIVAStr("");

                    await loadTabs("OPEN");
                    await loadReservedAllOpen();
                    setSelected(null);
                    setUiView("MAP");
                    flash("Venta cerrada");
                  }}
                >
                  Confirmar venta
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ================= Modal crear mesa/barra ================= */}
        {createOpen ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              display: "grid",
              placeItems: "center",
              padding: 16,
              zIndex: 60,
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setCreateOpen(false);
            }}
          >
            <div className="card" style={{ width: "min(560px, 94vw)", padding: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 1000, fontSize: 16 }}>
                    {placeType === "BARRA" ? "Abrir barra" : "Abrir mesa"}
                  </p>
                  <p
                    style={{
                      margin: "4px 0 0",
                      color: MUTED,
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    Ingresa el número para crear el nombre automáticamente.
                  </p>
                </div>

                <button className="btn btn-animate" type="button" onClick={() => setCreateOpen(false)}>
                  Cerrar
                </button>
              </div>

              <div style={{ marginTop: 14 }}>
                <p style={{ margin: "0 0 6px", color: MUTED, fontWeight: 900, fontSize: 12 }}>Número</p>
                <input
                  className="field"
                  value={createNumberStr}
                  onChange={(e) => setCreateNumberStr(e.target.value)}
                  inputMode="numeric"
                  placeholder="Ej: 3"
                />
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <button className="btn btn-animate" type="button" onClick={() => setCreateOpen(false)}>
                  Cancelar
                </button>

                <button
                  className="btn btn-primary btn-animate"
                  type="button"
                  onClick={async () => {
                    const n = Math.max(1, Math.round(toNum(createNumberStr, 0)));
                    const name = `${placeType === "BARRA" ? "Barra" : "Mesa"} ${n}`;

                    setCreateOpen(false);
                    requestOpenSlot(name);
                  }}
                >
                  Abrir
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ================= Modal eliminar mesa ================= */}
        {deleteOpen && selected ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              display: "grid",
              placeItems: "center",
              padding: 16,
              zIndex: 60,
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setDeleteOpen(false);
            }}
          >
            <div className="card" style={{ width: "min(640px, 94vw)", padding: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 1000, fontSize: 16 }}>Eliminar mesa</p>
                  <p
                    style={{
                      margin: "4px 0 0",
                      color: MUTED,
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    Esta acción elimina la mesa y sus ítems.
                  </p>
                </div>

                <button className="btn btn-animate" type="button" onClick={() => setDeleteOpen(false)}>
                  Cerrar
                </button>
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span className="pill">
                  Mesa: <b style={{ color: TEXT }}>{selected.name}</b>
                </span>
                <span className="pill">
                  Ítems: <b style={{ color: TEXT }}>{selected.items?.length || 0}</b>
                </span>
                <span className="pill">
                  Total: <b style={{ color: TEXT }}>{COP.format(selectedTotals.total || 0)}</b>
                </span>
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <button className="btn btn-animate" type="button" onClick={() => setDeleteOpen(false)}>
                  Cancelar
                </button>

                <button
                  className="btn btn-danger btn-animate"
                  type="button"
                  onClick={async () => {
                    if (!selected) return;

                    const r = await tabsDeleteOnline(selected.id);
                    if (!r.ok) {
                      setMsg(r.error || "No se pudo eliminar");
                      return;
                    }

                    setDeleteOpen(false);
                    setSelected(null);
                    setUiView("MAP");
                    await loadTabs("OPEN");
                    await loadReservedAllOpen();
                    flash("Mesa eliminada");
                  }}
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ================= Receta inline (modal detalles) ================= */
function RecipeInline({
  product,
  getRecipe,
  productsById,
}: {
  product: Product;
  getRecipe: (id: string) => Promise<RecipeItem[]>;
  productsById: Map<string, Product>;
}) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<RecipeItem[]>([]);
  const kind = String(product.kind || "").toUpperCase();

  useEffect(() => {
    let alive = true;
    (async () => {
      if (kind !== "COCKTAIL") {
        setItems([]);
        return;
      }
      setLoading(true);
      const r = await getRecipe(product.id);
      if (!alive) return;
      setItems(r || []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [product.id, kind, getRecipe]);

  if (kind !== "COCKTAIL") {
    return <div className="pill">Producto estándar</div>;
  }

  if (loading) {
    return <div className="pill">Cargando receta...</div>;
  }

  if (!items.length) {
    return <div className="pill">Sin receta</div>;
  }

  return (
    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
      {items.map((it, idx) => {
        const ing = productsById.get(it.ingredient_id);
        const name = it.ingredient_name || ing?.name || "Ingrediente";
        const qty = toNum(it.qty, 0);
        const unit = it.unit || it.ingredient_measure || "";
        return (
          <div key={`${it.ingredient_id}-${idx}`} className="card" style={{ padding: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
              }}
            >
              <b>{name}</b>
              <span className="pill">
                {qty} {unit}
              </span>
            </div>
            <p style={{ margin: "6px 0 0", color: MUTED, fontWeight: 800, fontSize: 12 }}>
              Rol: {it.role}
            </p>
          </div>
        );
      })}
    </div>
  );
}
