import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/* ================= Tipos ================= */
type Role = "admin" | "vendedor";
type Me = { id: string; username: string; name: string; role: Role } | null;

type ProductKind = "STANDARD" | "COCKTAIL" | "BASE" | "ACCOMP";

type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  min_stock: number;
  is_active?: number;
  kind?: ProductKind;
  inv_type?: string;
  stock_available?: number;
  measure?: string | null;
};

type CartLine = {
  product: Product;
  qty: number;
  unit_price: number;
  line_discount: number;
  tax_rate?: number;
};

type TransferProvider = "NEQUI" | "DAVIPLATA";
type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "OTHER";
type Payment = {
  method: PaymentMethod;
  amount: number;
  reference?: string;
  provider?: TransferProvider | null;
};

type RecipeItem = {
  ingredient_id: string;
  qty: number;
  role?: "BASE" | "ACCOMP";
  unit?: string;
  note?: string;
};

type ApiOk<T> = { ok: true } & T;
type ApiFail = { ok: false; error?: string };
type ApiResp<T = any> = ApiOk<T> | ApiFail;

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

/* =============== HTTP helpers ONLINE =============== */
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
    /* Fetch sin caché para evitar 304 (Not Modified) en /api/auth/me */
    const doFetch = (cache: RequestCache) => {
      return fetch(url, {
        method,
        headers: {
          ...headers,
          ...(method === "GET"
            ? { "Cache-Control": "no-cache", Pragma: "no-cache" }
            : null),
        },
        body: body != null ? JSON.stringify(body) : undefined,
        credentials: "omit",
        cache,
      });
    };

    let res = await doFetch("no-store");
    if (res.status === 304) {
      res = await doFetch("reload");
    }

    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return {
        ok: false,
        error: `Respuesta no JSON (${res.status}) en ${path}: ${text.slice(0, 160)}`,
      };
    }

    const ok = typeof data.ok === "boolean" ? data.ok : res.ok;
    if (!ok) return { ok: false, error: data.error || res.statusText || "Error de red" };
    return { ok: true, ...(data || {}) } as ApiOk<T>;
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }

}

/* Auth actual */
async function safeAuthMe(): Promise<ApiResp<{ user: Me }>> {
  return httpJSON("GET", "/api/auth/me", undefined, { auth: true });
}

/* Helpers de API ONLINE */
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

function getIdLike(v: any): string {
  const raw = v?.id ?? v?._id ?? v?.product_id ?? v?.productId ?? "";
  return raw ? String(raw) : "";
}

function toNum(n: any, fallback = 0): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function normProduct(raw: any): Product | null {
  const id = getIdLike(raw);
  if (!id) return null;
  return {
    id,
    name: String(raw?.name ?? ""),
    category: String(raw?.category ?? ""),
    price: toNum(raw?.price, 0),
    stock: toNum(raw?.stock, 0),
    min_stock: toNum(raw?.min_stock, 0),
    is_active: raw?.is_active,
    kind: raw?.kind,
    inv_type: raw?.inv_type,
    stock_available: raw?.stock_available != null ? toNum(raw?.stock_available, 0) : undefined,
    measure: raw?.measure ?? null,
  };
}

function normRecipeItem(raw: any): RecipeItem | null {
  const ingredient_id =
    getIdLike({ id: raw?.ingredient_id }) ||
    getIdLike({ id: raw?.ingredientId }) ||
    getIdLike(raw?.ingredient) ||
    getIdLike({ id: raw?.ingredient }) ||
    "";
  if (!ingredient_id) return null;

  return {
    ingredient_id,
    qty: toNum(raw?.qty, 0),
    role: raw?.role,
    unit: raw?.unit,
    note: raw?.note,
  };
}

async function salesCatalogOnline(args: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<ApiResp<{ items?: any[]; total?: number }>> {
  const query = buildQuery({
    q: args.q || "",
    limit: args.limit ?? 500,
    offset: args.offset ?? 0,
  });
  return httpJSON("GET", `/api/sales/catalog${query}`, undefined, { auth: true });
}

async function productsListOnline(args?: {
  q?: string;
  include_inactive?: boolean;
  limit?: number;
}): Promise<ApiResp<{ items?: any[]; total?: number }>> {
  const query = buildQuery({
    q: args?.q || "",
    include_inactive: args?.include_inactive ? 1 : 0,
    limit: args?.limit ?? 5000,
  });
  return httpJSON("GET", `/api/products${query}`, undefined, { auth: true });
}

/* Receta: intenta varias rutas para compatibilidad */
async function recipeGetOnline(productId: string): Promise<ApiResp<{ items?: any[] }>> {
  const tries = [
    `/api/recipes/${encodeURIComponent(productId)}`,
    `/api/recipes/by-product${buildQuery({ product_id: productId })}`,
    `/api/recipes/get${buildQuery({ product_id: productId })}`,
    `/api/inventory/recipe/get${buildQuery({ product_id: productId })}`,
    `/api/recipes/by-product${buildQuery({ id: productId })}`,
    `/api/recipes/get${buildQuery({ id: productId })}`,
    `/api/inventory/recipe/get${buildQuery({ id: productId })}`,
  ];

  for (const path of tries) {
    const r = await httpJSON<{ items?: any[] }>("GET", path, undefined, { auth: true });
    if (r.ok) return r;
  }
  return { ok: true, items: [] };
}

async function salesCreateOnline(body: {
  items: {
    product_id: string;
    qty: number;
    unit_price: number;
    line_discount: number;
    tax_rate?: number;
  }[];
  payments: Payment[];
  status?: string;
  subtotal?: number;
  discount_total?: number;
  tax_total?: number;
  total?: number;
  notes?: string;
  note?: string;
  client?: string;
  customer_name?: string;
  tab_id?: string | null;
}): Promise<ApiResp<{ sale?: { id: string; created_at: string } }>> {
  return httpJSON("POST", "/api/sales", body, { auth: true });
}

/* ====== Helpers ====== */
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

const shell: React.CSSProperties = { minHeight: "100vh", background: BG, color: TEXT, display: "flex" };
const main: React.CSSProperties = { flex: 1, display: "flex", justifyContent: "center", overflowX: "hidden" };
const container: React.CSSProperties = { width: "min(1120px, 96vw)", padding: "18px 18px 28px" };

const header: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
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

const sectionTitle: React.CSSProperties = { padding: "14px 16px", fontWeight: 800 };
const tableHead: React.CSSProperties = { padding: "10px 16px", borderBottom: "1px solid #eef0f4", background: "#fafafc" };
const rowBase: React.CSSProperties = { padding: "12px 16px", borderTop: "1px solid #f0f1f5" };

const th: React.CSSProperties = { fontSize: 13, color: "#333", fontWeight: 700, minWidth: 0 };
const td: React.CSSProperties = { fontSize: 14, color: "#111", minWidth: 0, wordBreak: "break-word" as any };

const inputBase: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "10px 12px",
  lineHeight: "22px",
  borderRadius: 12,
  background: "#fff",
  border: "1px solid #e5e7eb",
  outline: "none",
  minWidth: 0,
  boxSizing: "border-box",
};

const input = inputBase;
const inputSm: React.CSSProperties = { ...inputBase, height: 38, padding: "8px 10px" };

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

const btnPrimary: React.CSSProperties = {
  ...btn,
  borderColor: `rgba(${YRGB},0.8)`,
  background: "linear-gradient(180deg, #ffffff, rgba(255,255,255,0.9))",
  color: TEXT,
  fontWeight: 800,
};

const btnSoft: React.CSSProperties = {
  ...btn,
  borderColor: `rgba(${YRGB},0.45)`,
  background: `linear-gradient(180deg, rgba(${YRGB},0.16), rgba(${YRGB},0.10))`,
  color: "#3a3200",
  fontWeight: 600,
};

/* Iconos */
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

/* Breakpoints */
function useBreakpoints() {
  const get = () => {
    if (typeof window === "undefined") return { narrow: false };
    const mq = window.matchMedia("(max-width: 980px)");
    return { narrow: mq.matches };
  };
  const [state, setState] = useState(get);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 980px)");
    const onChange = () => setState({ narrow: mq.matches });
    if ((mq as any).addEventListener) {
      (mq as any).addEventListener("change", onChange);
      return () => (mq as any).removeEventListener("change", onChange);
    } else {
      (mq as any).addListener?.(onChange);
      return () => (mq as any).removeListener?.(onChange);
    }
  }, []);
  return state;
}

const onlyDigits = (s: string) => String(s ?? "").replace(/\D/g, "");
const keepPercent = (s: string) => String(s ?? "").replace(/[^\d.,]/g, "");
const parsePercent = (s: string) => {
  const n = Number(keepPercent(s).replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
};

function isAllowedForCatalog(p: Product): boolean {
  const k = String(p.kind || "").toUpperCase();
  if (k === "STANDARD" || k === "COCKTAIL") return true;
  if (!k) {
    const inv = String((p as any).inv_type || "").toUpperCase();
    return inv === "UNIT" || inv === "COCKTAIL";
  }
  return false;
}

/* ===== Conversión a unidad canónica (ml / g / unit) ===== */
function normUnit(u?: string): string {
  const s = String(u || "").trim().toLowerCase();
  if (!s) return "";
  if (s === "ml" || s === "milliliter" || s === "mililitro" || s === "mililitros") return "ml";
  if (s === "l" || s === "lt" || s === "litro" || s === "litros") return "l";
  if (s === "g" || s === "gramo" || s === "gramos") return "g";
  if (s === "kg" || s === "kilogramo" || s === "kilogramos") return "kg";
  if (s === "u" || s === "ud" || s === "unidad" || s === "unidades" || s === "unit") return "unit";
  return s;
}

function canonicalKind(p?: Product | null): "ml" | "g" | "unit" {
  const m = String(p?.measure || "").toLowerCase();
  if (m.includes("ml") || m.includes("l")) return "ml";
  if (m.includes("g") || m.includes("kg")) return "g";
  return "unit";
}

function toCanonicalQty(qty: number, unit: string, ingredient: Product | null): number {
  const q = toNum(qty, 0);
  if (!(q > 0)) return 0;

  const u = normUnit(unit);
  const canon = canonicalKind(ingredient);

  if (canon === "ml") {
    if (u === "l") return q * 1000;
    if (u === "ml" || !u) return q;
    return q;
  }

  if (canon === "g") {
    if (u === "kg") return q * 1000;
    if (u === "g" || !u) return q;
    return q;
  }

  if (u === "unit" || !u) return q;
  return q;
}
export default function SalesPage() {
  const { narrow } = useBreakpoints();
  const navigate = useNavigate();

  const [, setMe] = useState<Me>(null);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [uiDiscount, setUiDiscount] = useState<Record<string, string>>({});
  const [uiTax, setUiTax] = useState<Record<string, string>>({});
  const [uiQty, setUiQty] = useState<Record<string, string>>({});
  const [placeType, setPlaceType] = useState<"mesa" | "barra">("mesa");
  const [tableNumber, setTableNumber] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [showPay, setShowPay] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([{ method: "CASH", amount: 0 }]);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");

  const [recipes, setRecipes] = useState<Record<string, RecipeItem[]>>({});
  const [cocktailAvail, setCocktailAvail] = useState<Record<string, number>>({});
  const [stockCache, setStockCache] = useState<Record<string, number>>({});

  const [saleToastOpen, setSaleToastOpen] = useState(false);
  const [saleToastText, setSaleToastText] = useState("Venta cerrada");
  const saleToastTimer = useRef<number | null>(null);

  const showSaleToast = (text: string) => {
    setSaleToastText(text);
    setSaleToastOpen(true);
    if (saleToastTimer.current) window.clearTimeout(saleToastTimer.current);
    saleToastTimer.current = window.setTimeout(() => setSaleToastOpen(false), 5000);
  };

  useEffect(() => {
    return () => {
      if (saleToastTimer.current) window.clearTimeout(saleToastTimer.current);
    };
  }, []);

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

  const refreshStockFromServer = async () => {
    const [catRes, allRes] = await Promise.all([
      salesCatalogOnline({ q: "", limit: 500 }),
      productsListOnline({ q: "", include_inactive: false, limit: 5000 }),
    ]);

    if (!catRes.ok) return;
    const catItemsRaw = Array.isArray((catRes as any).items) ? ((catRes as any).items as any[]) : [];
    const allItemsRaw = allRes.ok && Array.isArray((allRes as any).items) ? ((allRes as any).items as any[]) : [];

    const catItems = catItemsRaw.map(normProduct).filter(Boolean) as Product[];
    const allItems = allItemsRaw.map(normProduct).filter(Boolean) as Product[];

    let baseItems: Product[] = catItems;
    if (!baseItems.length && allItems.length) {
      baseItems = allItems
        .filter(isAllowedForCatalog)
        .map((p) => ({ ...p, stock_available: p.stock_available ?? p.stock ?? 0 }));
    }

    const vendibles = baseItems
      .filter((p) => !!p.id)
      .filter(isAllowedForCatalog)
      .filter((p) => (p.is_active ?? 1) !== 0)
      .map((p) => ({ ...p, stock_available: p.stock_available ?? p.stock ?? 0 }));

    setProducts(vendibles);
    setAllProducts(allItems);
    setStockCache({});
  };

  useEffect(() => {
    (async () => {
      try {
        const token = getToken();
        if (!token) {
          navigate("/login", { replace: true });
          setLoading(false);
          return;
        }

        const cur = await safeAuthMe();
        if (!cur.ok || !cur.user) {
          setToken(null);
          navigate("/login", { replace: true });
          setLoading(false);
          return;
        }
        setMe(cur.user);

        await refreshStockFromServer();
      } catch (e: any) {
        setMsg(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const prodById = useMemo(() => {
    const map = new Map<string, Product>();
    (allProducts || []).forEach((p) => {
      if (p?.id) map.set(p.id, p);
    });
    return map;
  }, [allProducts]);

  const getAvailableForIngredient = async (ingredient_id: string): Promise<number> => {
    if (!ingredient_id) return 0;
    if (stockCache[ingredient_id] != null) return stockCache[ingredient_id];

    const ing = prodById.get(ingredient_id);
    const avail = Math.max(0, Number((ing?.stock_available ?? ing?.stock ?? 0) as any));
    setStockCache((prev) => ({ ...prev, [ingredient_id]: avail }));
    return avail;
  };

  useEffect(() => {
    (async () => {
      const cocktails = (products || []).filter(
        (p) =>
          String(p.kind || "").toUpperCase() === "COCKTAIL" ||
          String(p.inv_type || "").toUpperCase() === "COCKTAIL"
      );
      if (cocktails.length === 0) return;

      const newRecipes: Record<string, RecipeItem[]> = { ...recipes };
      const newAvail: Record<string, number> = {};

      for (const c of cocktails) {
        try {
          if (!newRecipes[c.id]) {
            const r = await recipeGetOnline(c.id);
            const rawItems: any[] = r.ok && Array.isArray((r as any).items) ? (r as any).items : [];
            const items = rawItems.map(normRecipeItem).filter(Boolean) as RecipeItem[];
            newRecipes[c.id] = items;
          }
        } catch {
          newRecipes[c.id] = [];
        }

        const items = newRecipes[c.id] || [];
        if (items.length === 0) {
          newAvail[c.id] = 0;
          continue;
        }

        let can = Infinity;
        for (const it of items) {
          const ing = prodById.get(it.ingredient_id) || null;
          const ingAvailable = await getAvailableForIngredient(it.ingredient_id);

          const needCanonical = toCanonicalQty(Number(it.qty ?? 0), String(it.unit || ""), ing);
          if (!(needCanonical > 0)) continue;

          const units = Math.floor(ingAvailable / needCanonical);
          can = Math.min(can, units);
        }

        newAvail[c.id] = Number.isFinite(can) ? Math.max(0, can) : 0;
      }

      setRecipes(newRecipes);
      setCocktailAvail(newAvail);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, prodById]);

  const cartStats = useMemo(() => {
    let subtotal = 0,
      discount_total = 0,
      tax_total = 0,
      total = 0;

    for (const line of cart) {
      const gross = line.unit_price * line.qty;
      const disc = Math.max(0, Number.isFinite(line.line_discount) ? line.line_discount : 0);
      const base = Math.max(0, gross - disc);
      const taxRate = typeof line.tax_rate === "number" ? line.tax_rate : 0;
      const tax = Math.round((base * taxRate) / 100);
      subtotal += base;
      discount_total += disc;
      tax_total += tax;
      total += base + tax;
    }
    return { subtotal, discount_total, tax_total, total };
  }, [cart]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = (products || [])
      .filter(isAllowedForCatalog)
      .filter((p) => (p.is_active ?? 1) !== 0)
      .filter((p) => !!p.id);
    if (!s) return base;
    return base.filter(
      (p) => p.name.toLowerCase().includes(s) || (p.category || "").toLowerCase().includes(s)
    );
  }, [products, q]);

  const categorias = useMemo(() => {
    const set = new Set<string>();
    (products || []).forEach((p) => set.add((p.category || "Sin categoría").trim() || "Sin categoría"));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const applyOptimisticStockDeduction = (soldLines: CartLine[]) => {
    const stdDelta = new Map<string, number>();
    const ingDelta = new Map<string, number>();

    for (const l of soldLines) {
      const pid = l.product.id;
      if (!pid) continue;

      const isCocktail =
        String(l.product.kind || "").toUpperCase() === "COCKTAIL" ||
        String(l.product.inv_type || "").toUpperCase() === "COCKTAIL";

      if (!isCocktail) {
        stdDelta.set(pid, (stdDelta.get(pid) || 0) + l.qty);
        continue;
      }

      const items = recipes[pid] || [];
      for (const it of items) {
        const ing = prodById.get(it.ingredient_id) || null;
        const needPerCocktail = toCanonicalQty(Number(it.qty ?? 0), String(it.unit || ""), ing);
        if (!(needPerCocktail > 0)) continue;
        const totalNeed = needPerCocktail * l.qty;
        ingDelta.set(it.ingredient_id, (ingDelta.get(it.ingredient_id) || 0) + totalNeed);
      }
    }

    setProducts((prev) =>
      prev.map((p) => {
        const d = stdDelta.get(p.id);
        if (!d) return p;
        const cur = Number(p.stock_available ?? p.stock ?? 0);
        const next = Math.max(0, cur - d);
        return { ...p, stock_available: next, stock: typeof p.stock === "number" ? Math.max(0, p.stock - d) : p.stock };
      })
    );

    setAllProducts((prev) =>
      prev.map((p) => {
        const dStd = stdDelta.get(p.id) || 0;
        const dIng = ingDelta.get(p.id) || 0;
        const d = dStd + dIng;
        if (!d) return p;
        const cur = Number(p.stock_available ?? p.stock ?? 0);
        const next = Math.max(0, cur - d);
        return { ...p, stock_available: next, stock: typeof p.stock === "number" ? Math.max(0, p.stock - d) : p.stock };
      })
    );

    setStockCache({});
  };

  const addToCart = (p: Product) => {
    if (!p?.id) {
      setMsg("Producto inválido");
      return;
    }

    const isCocktail =
      String(p.kind || "").toUpperCase() === "COCKTAIL" ||
      String(p.inv_type || "").toUpperCase() === "COCKTAIL";

    const avail = isCocktail ? cocktailAvail[p.id] ?? 0 : Infinity;
    if (isCocktail && avail <= 0) {
      setMsg("No hay disponibilidad de ingredientes para este cóctel");
      return;
    }

    setCart((prev) => {
      const i = prev.findIndex((l) => l.product.id === p.id);
      if (i >= 0) {
        const current = prev[i];
        const nextQty = current.qty + 1;
        if (isCocktail && nextQty > avail) return prev;
        const n = [...prev];
        n[i] = { ...n[i], qty: nextQty };
        return n;
      }
      return [...prev, { product: p, qty: 1, unit_price: p.price, line_discount: 0, tax_rate: 0 }];
    });

    setUiDiscount((prev) => ({ ...prev, [p.id]: "0" }));
    setUiTax((prev) => ({ ...prev, [p.id]: "0%" }));
    setUiQty((prev) => {
      const { [p.id]: _omit, ...rest } = prev;
      return rest;
    });
  };

  const removeFromCart = (pid: string) => {
    setCart((prev) => prev.filter((l) => l.product.id !== pid));
    setUiDiscount((prev) => {
      const n = { ...prev };
      delete n[pid];
      return n;
    });
    setUiTax((prev) => {
      const n = { ...prev };
      delete n[pid];
      return n;
    });
    setUiQty((prev) => {
      const n = { ...prev };
      delete n[pid];
      return n;
    });
  };

  const setQty = (pid: string, qty: number) => {
    const safe = Math.max(1, Math.trunc(qty) || 1);
    setCart((prev) => prev.map((l) => (l.product.id === pid ? { ...l, qty: safe } : l)));
  };

  const incQty = (pid: string, d = 1) => {
    setCart((prev) =>
      prev.map((l) => {
        if (l.product.id !== pid) return l;

        const isCocktail =
          String(l.product.kind || "").toUpperCase() === "COCKTAIL" ||
          String(l.product.inv_type || "").toUpperCase() === "COCKTAIL";

        const avail = isCocktail ? cocktailAvail[l.product.id] ?? 0 : Infinity;
        const next = l.qty + d;

        if (next < 1) return { ...l, qty: 1 };
        if (isCocktail && next > avail) return l;
        return { ...l, qty: next };
      })
    );

    setUiQty((prev) => {
      const { [pid]: _omit, ...rest } = prev;
      return rest;
    });
  };

  const onDiscountChange = (pid: string, v: string) => {
    const digits = onlyDigits(v);
    const numV = Number(digits);
    const val = Number.isFinite(numV) ? Math.max(0, Math.round(numV)) : 0;
    setUiDiscount((prev) => ({ ...prev, [pid]: digits }));
    setCart((prev) => prev.map((l) => (l.product.id === pid ? { ...l, line_discount: val } : l)));
  };

  const onTaxChange = (pid: string, v: string) => {
    const n = parsePercent(v);
    setUiTax((prev) => ({ ...prev, [pid]: `${n}%` }));
    setCart((prev) => prev.map((l) => (l.product.id === pid ? { ...l, tax_rate: n } : l)));
  };

  const openPay = () => {
    setMsg("");
    setPayments([{ method: "CASH", amount: cartStats.total }]);
    setShowPay(true);
  };

  /* Pagado, restante y cambio del modal */
  const payPreview = useMemo(() => {
    const due = Math.max(0, Math.round(toNum(cartStats.total, 0)));
    const paid = (payments || []).reduce((s, ln) => {
      const amt = Math.max(0, Math.round(toNum(ln.amount, 0)));
      return s + amt;
    }, 0);
    const remaining = Math.max(0, due - paid);
    const change = Math.max(0, paid - due);
    return { due, paid, remaining, change };
  }, [payments, cartStats.total]);

  const clientString = useMemo(() => {
    if (placeType === "mesa") {
      const n = (tableNumber || "").trim();
      return n ? `Mesa ${n}` : "Mesa s/n";
    }
    return "Barra";
  }, [placeType, tableNumber]);
  const createSale = async () => {
    try {
      setCreating(true);
      setMsg("");

      if (cart.length === 0) {
        setMsg("Carrito vacío");
        return;
      }

      for (const l of cart) {
        if (!l?.product?.id) {
          setMsg("Hay productos inválidos en el carrito");
          return;
        }

        const isCocktail =
          String(l.product.kind || "").toUpperCase() === "COCKTAIL" ||
          String(l.product.inv_type || "").toUpperCase() === "COCKTAIL";

        if (isCocktail) {
          const can = cocktailAvail[l.product.id] ?? 0;
          if (l.qty > can) {
            setMsg("Ingredientes insuficientes para uno o más cócteles");
            return;
          }
        } else {
          const stockShown = Number(l.product.stock_available ?? l.product.stock ?? 0);
          if (l.qty > stockShown) {
            setMsg("Sin stock para uno o más productos");
            return;
          }
        }
      }

      const normalizedPayments = payments
        .filter((p) => Number(p.amount) > 0)
        .map((p) => {
          const amount = Math.round(Number(p.amount) || 0);
          const reference = (p.reference || "").trim() || undefined;
          if (p.method === "TRANSFER") {
            const raw = (p.provider || "NEQUI").toString().trim().toUpperCase();
            const provider: TransferProvider =
              raw === "NEQUI" || raw === "DAVIPLATA" ? (raw as TransferProvider) : "NEQUI";
            return { method: "TRANSFER" as const, provider, amount, reference };
          }
          return { method: p.method, amount, reference };
        });

      const due = Math.max(0, Math.round(toNum(cartStats.total, 0)));

      if (due > 0 && normalizedPayments.length === 0) {
        setMsg("El total pagado debe ser mayor a 0");
        return;
      }

      const finalPayments: Payment[] = normalizedPayments.length > 0 ? (normalizedPayments as any) : [];

      const paid = finalPayments.reduce<number>((a, p: any) => a + Math.max(0, Math.round(toNum(p.amount, 0))), 0);
      if (due > 0 && paid < due) {
        setMsg(`Faltan ${COP.format(due - paid)} para completar el pago`);
        return;
      }

      const soldSnapshot = cart.map((l) => ({ ...l }));

      const payload = {
        items: cart.map((l) => ({
          product_id: String(l.product.id),
          qty: l.qty,
          unit_price: l.unit_price,
          line_discount: l.line_discount,
          tax_rate: typeof l.tax_rate === "number" ? l.tax_rate : undefined,
        })),
        payments: finalPayments,
        status: "COMPLETED",
        subtotal: cartStats.subtotal,
        discount_total: cartStats.discount_total,
        tax_total: cartStats.tax_total,
        total: cartStats.total,
        notes: notes.trim() || undefined,
        client: clientString,
        customer_name: clientString,
        tab_id: null as any,
      };

      const res = await salesCreateOnline(payload);
      if (!res.ok) {
        setMsg(res.error || "No fue posible crear la venta");
        return;
      }

      applyOptimisticStockDeduction(soldSnapshot);

      setCart([]);
      setPayments([{ method: "CASH", amount: 0 }]);
      setUiDiscount({});
      setUiTax({});
      setUiQty({});
      setShowPay(false);
      setPlaceType("mesa");
      setTableNumber("");
      setNotes("");

      showSaleToast("Venta cerrada");

      try {
        await refreshStockFromServer();
      } catch {
        // Mantener estado optimista si falla el refresh
      }
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div style={{ height: "100vh", background: BG, color: TEXT, display: "grid", placeItems: "center" }}>
        Cargando…
      </div>
    );
  }

  const GRID_TWO_COLS = narrow ? "1fr" : "minmax(0,0.92fr) minmax(0,1.08fr)";
  const GRID_CART = narrow
    ? "minmax(0,1.3fr) minmax(0,0.7fr) minmax(0,1.0fr) minmax(0,1.4fr) minmax(0,0.9fr)"
    : "minmax(0,1.5fr) minmax(0,0.7fr) minmax(0,1.0fr) minmax(0,1.4fr) minmax(0,0.9fr)";

  const renderCocktailAvail = (productId: string) => {
    const n = cocktailAvail[productId];
    if (typeof n !== "number") return <span style={{ fontSize: 12, color: MUTED }}>Ingredientes / receta</span>;
    return <span style={{ fontSize: 12, color: n > 0 ? "#055" : "#b00020" }}>Disp: {n}</span>;
  };

  return (
    <div style={shell} className="sales-root">
      {saleToastOpen && (
        <div className="sale-toast-wrap" onClick={() => setSaleToastOpen(false)}>
          <div className="sale-toast cardfx" style={{ ...card, padding: 12 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 800 }}>{saleToastText}</div>
              <button style={{ ...btn, padding: "6px 10px" }} className="btn-animate" onClick={() => setSaleToastOpen(false)}>
                Cerrar
              </button>
            </div>
            <div style={{ marginTop: 8, height: 4, borderRadius: 999, background: `rgba(${YRGB},0.20)` }}>
              <div className="sale-toast-bar" />
            </div>
          </div>
        </div>
      )}

      <div style={main}>
        <div style={container}>
          <header style={header}>
            <div style={titleRow}>
              <button style={backBtn} className="btn-animate" onClick={() => navigate("/dashboard")} aria-label="Volver al dashboard">
                <IHome />
              </button>
              <div>
                <h1 style={h1}>VENTAS</h1>
                <p style={subtitle}>Venta rápida</p>
              </div>
            </div>
            <div />
          </header>

          {msg && (
            <div className="cardfx" style={{ ...card, padding: 10, borderLeft: "4px solid #b00020", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span>{msg}</span>
                <button style={{ ...btn, padding: "6px 10px" }} className="btn-animate" onClick={() => setMsg("")}>
                  Cerrar
                </button>
              </div>
            </div>
          )}

          <div className="cardfx" style={{ ...card, padding: 12, marginBottom: 12 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div style={inputWithIconWrap}>
                <span style={leftIcon}>
                  <ISearch />
                </span>
                <input
                  style={inputWithIcon}
                  placeholder="Buscar por nombre o categoría"
                  value={q}
                  onChange={(e) => setQ(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setQ(q);
                  }}
                />
              </div>

              <select
                defaultValue=""
                onChange={(e) => {
                  const cat = e.currentTarget.value;
                  setQ(cat ? cat : "");
                }}
                style={input}
              >
                <option value="">Todas las categorías</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <button style={{ ...btn, justifySelf: "start", maxWidth: 180 }} className="btn-animate" onClick={() => setQ(q)}>
                Buscar
              </button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 14,
              gridTemplateColumns: GRID_TWO_COLS,
              alignItems: "start",
              minWidth: 0,
            }}
          >
            <div className="cardfx" style={{ ...card, minWidth: 0 }}>
              <div style={{ ...sectionTitle, borderBottom: "1px solid #eef0f4" }}>Catálogo</div>

              {filtered.length === 0 ? (
                <div style={{ padding: 16 }}>Sin productos</div>
              ) : (
                <div style={{ padding: 10, maxHeight: narrow ? 260 : 360, overflowY: "auto" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 10 }}>
                    {filtered.map((p) => {
                      const isCocktail =
                        String(p.kind || "").toUpperCase() === "COCKTAIL" ||
                        String(p.inv_type || "").toUpperCase() === "COCKTAIL";

                      const stockShown = Number(p.stock_available ?? p.stock ?? 0);
                      const low = !isCocktail && p.min_stock > 0 && stockShown <= p.min_stock;
                      const cocktailCan = isCocktail ? cocktailAvail[p.id] ?? 0 : null;
                      const isOutOfStock = isCocktail ? (cocktailCan ?? 0) <= 0 : stockShown <= 0;

                      return (
                        <div
                          key={p.id}
                          onClick={() => {
                            if (isOutOfStock) return;
                            addToCart(p);
                          }}
                          style={{
                            border: `1px solid rgba(${YRGB},0.42)`,
                            borderRadius: 12,
                            padding: 10,
                            display: "grid",
                            gap: 6,
                            background: "#fff",
                            cursor: isOutOfStock ? "not-allowed" : "pointer",
                            opacity: isOutOfStock ? 0.6 : 1,
                            userSelect: "none",
                            touchAction: "manipulation",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: 14,
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span>{p.name}</span>
                            {isCocktail && (
                              <span
                                style={{
                                  padding: "2px 8px",
                                  borderRadius: 999,
                                  fontSize: 11,
                                  color: "#0b5",
                                  background: "rgba(0,170,90,.08)",
                                  border: "1px solid rgba(0,170,90,.35)",
                                }}
                              >
                                Cóctel
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: 12, color: MUTED }}>{p.category || "Sin categoría"}</div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                            <div style={{ fontWeight: 800, fontSize: 14 }}>{COP.format(p.price)}</div>

                            {!isCocktail ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 12, color: MUTED }}>Stock: {stockShown}</span>
                                {low ? (
                                  <span
                                    style={{
                                      padding: "2px 8px",
                                      borderRadius: 999,
                                      fontSize: 11,
                                      color: "#8a6d00",
                                      background: `rgba(${YRGB},.18)`,
                                      border: `1px solid rgba(${YRGB},.55)`,
                                    }}
                                  >
                                    Bajo
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <div>{renderCocktailAvail(p.id)}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="cardfx" style={{ ...card, minWidth: 0 }}>
              <div style={tableHead}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800 }}>Carrito</div>
                  <button
                    onClick={() => {
                      setCart([]);
                      setUiDiscount({});
                      setUiTax({});
                      setUiQty({});
                    }}
                    disabled={cart.length === 0}
                    style={{
                      ...btn,
                      opacity: cart.length ? 1 : 0.7,
                      cursor: cart.length ? "pointer" : "not-allowed",
                    }}
                    className="btn-animate"
                  >
                    Vaciar
                  </button>
                </div>
              </div>

              <div style={{ ...rowBase, borderTop: "none", paddingTop: 10, paddingBottom: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: GRID_CART, gap: 10, alignItems: "center", minWidth: 0 }}>
                  <div style={th}>Producto</div>
                  <div style={{ ...th, textAlign: "right" }}>Precio</div>
                  <div style={{ ...th, textAlign: "right" }}>Descuento / IVA</div>
                  <div style={{ ...th, textAlign: "center" }}>Cant.</div>
                  <div style={{ ...th, textAlign: "right" }}>Total</div>
                </div>
              </div>

              {cart.length === 0 ? (
                <div style={{ padding: 16 }}>Sin productos</div>
              ) : (
                <div style={{ maxHeight: narrow ? 260 : 320, overflowY: "auto" }}>
                  {cart.map((l) => {
                    const isCocktail =
                      String(l.product.kind || "").toUpperCase() === "COCKTAIL" ||
                      String(l.product.inv_type || "").toUpperCase() === "COCKTAIL";

                    const stockShown = Number(l.product.stock_available ?? l.product.stock ?? 0);
                    const overStandard = !isCocktail && l.qty > stockShown;

                    const recipeCan = isCocktail ? cocktailAvail[l.product.id] ?? 0 : Infinity;
                    const overRecipe = isCocktail && l.qty > recipeCan;
                    const disablePlus = isCocktail && (recipeCan <= 0 || l.qty >= recipeCan);

                    const gross = l.unit_price * l.qty;
                    const disc = Math.max(0, Number.isFinite(l.line_discount) ? l.line_discount : 0);
                    const base = Math.max(0, gross - disc);
                    const taxRate = typeof l.tax_rate === "number" ? l.tax_rate : 0;
                    const tax = Math.round((base * taxRate) / 100);
                    const lineTotal = base + tax;

                    const discStr = uiDiscount[l.product.id] ?? String(l.line_discount ?? 0);
                    const taxStr = uiTax[l.product.id] ?? `${l.tax_rate ?? 0}%`;
                    const qtyStr = uiQty[l.product.id] ?? String(l.qty);

                    return (
                      <div key={l.product.id} style={{ ...rowBase, minWidth: 0 }}>
                        <div style={{ display: "grid", gridTemplateColumns: GRID_CART, gap: 10, alignItems: "center", minWidth: 0 }}>
                          <div style={{ ...td, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, wordBreak: "break-word", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              {l.product.name}
                              {isCocktail && (
                                <span
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    fontSize: 11,
                                    color: "#0b5",
                                    background: "rgba(0,170,90,.08)",
                                    border: "1px solid rgba(0,170,90,.35)",
                                  }}
                                >
                                  Cóctel
                                </span>
                              )}
                            </div>

                            {!isCocktail ? (
                              <div style={{ fontSize: 12, color: MUTED }}>Stock: {stockShown}</div>
                            ) : (
                              <div style={{ fontSize: 12 }}>
                                <span style={{ color: recipeCan > 0 ? "#055" : "#b00020" }}>Disp: {recipeCan}</span>
                                {overRecipe && <span style={{ color: "#b00020", marginLeft: 8 }}>Ingredientes insuficientes</span>}
                              </div>
                            )}
                          </div>

                          <div style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", minWidth: 0 }}>
                            {COP.format(l.unit_price)}
                          </div>

                          <div style={{ ...td, minWidth: 0 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 8 }}>
                              <div>
                                <div style={{ fontSize: 12, color: MUTED, marginBottom: 4, textAlign: "right" }}>Descuento (COP)</div>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={discStr}
                                  onChange={(e) => onDiscountChange(l.product.id, e.currentTarget.value)}
                                  placeholder="0"
                                  title="Descuento en COP"
                                  style={{ ...input, textAlign: "right" }}
                                />
                              </div>

                              <div>
                                <div style={{ fontSize: 12, color: MUTED, marginBottom: 4, textAlign: "right" }}>IVA (%)</div>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={taxStr}
                                  onChange={(e) => onTaxChange(l.product.id, e.currentTarget.value)}
                                  placeholder="0%"
                                  title="IVA en %"
                                  style={{ ...input, textAlign: "right" }}
                                />
                              </div>
                            </div>
                          </div>

                          <div style={{ ...td, minWidth: 0 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "32px minmax(0,1fr) 32px", gap: 6, alignItems: "center" }}>
                              <button onClick={() => incQty(l.product.id, -1)} style={btn} className="btn-animate">
                                -
                              </button>

                              <input
                                type="text"
                                inputMode="numeric"
                                value={qtyStr}
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => {
                                  const digits = onlyDigits(e.currentTarget.value);
                                  setUiQty((prev) => ({ ...prev, [l.product.id]: digits }));
                                  if (!digits) return;
                                  const n = Math.max(1, parseInt(digits, 10) || 1);
                                  setQty(l.product.id, n);
                                }}
                                onBlur={() => {
                                  setUiQty((prev) => {
                                    const cur = prev[l.product.id];
                                    if (cur == null || cur === "") {
                                      const { [l.product.id]: _omit, ...rest } = prev;
                                      return rest;
                                    }
                                    const digits = onlyDigits(cur);
                                    const n = Math.max(1, parseInt(digits || "1", 10) || 1);
                                    return { ...prev, [l.product.id]: String(n) };
                                  });
                                }}
                                style={{ ...inputSm, textAlign: "center", width: "100%" }}
                              />

                              <button
                                onClick={() => incQty(l.product.id, +1)}
                                style={{ ...btn, opacity: disablePlus ? 0.6 : 1, cursor: disablePlus ? "not-allowed" : "pointer" }}
                                className="btn-animate"
                                disabled={disablePlus}
                              >
                                +
                              </button>
                            </div>

                            {!isCocktail && overStandard && (
                              <div style={{ color: "#b00020", fontSize: 12, marginTop: 6 }}>Sin stock</div>
                            )}
                          </div>

                          <div style={{ ...td, textAlign: "right", minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{COP.format(lineTotal)}</div>
                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                              {isCocktail && overRecipe && <span style={{ color: "#b00020", fontSize: 12 }}>Ingredientes insuficientes</span>}
                              <button onClick={() => removeFromCart(l.product.id)} style={btn} className="btn-animate">
                                Quitar
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="cardfx" style={{ ...card, marginTop: 14 }}>
            <div style={tableHead}>
              <div style={{ fontWeight: 800 }}>Resumen</div>
            </div>

            <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
              <div style={{ color: MUTED }}>Subtotal</div>
              <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{COP.format(cartStats.subtotal)}</div>
              <div style={{ color: MUTED }}>Descuentos</div>
              <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{COP.format(cartStats.discount_total)}</div>
              <div style={{ color: MUTED }}>Impuestos</div>
              <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{COP.format(cartStats.tax_total)}</div>
              <div style={{ fontWeight: 800 }}>Total</div>
              <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>{COP.format(cartStats.total)}</div>
            </div>

            <div style={{ padding: "10px 16px", display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "160px 1fr", gap: 8 }}>
                <select
                  value={placeType}
                  onChange={(e) => setPlaceType((e.currentTarget.value as "mesa" | "barra") || "mesa")}
                  style={input}
                >
                  <option value="mesa">Mesa</option>
                  <option value="barra">Barra</option>
                </select>

                {placeType === "mesa" ? (
                  <input
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.currentTarget.value.replace(/[^\dA-Za-z\- ]/g, "").slice(0, 10))}
                    placeholder="Número / código de mesa"
                    style={input}
                  />
                ) : (
                  <input value="Barra" disabled style={{ ...input, opacity: 0.85 }} />
                )}
              </div>

              <input value={notes} onChange={(e) => setNotes(e.currentTarget.value)} placeholder="Notas" style={input} />

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button
                  onClick={openPay}
                  disabled={cart.length === 0}
                  style={{
                    ...btnPrimary,
                    opacity: cart.length ? 1 : 0.7,
                    cursor: cart.length ? "pointer" : "not-allowed",
                  }}
                  className="btn-animate"
                >
                  Pagar
                </button>
              </div>
            </div>
          </div>

          {showPay && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,.35)",
                display: "grid",
                placeItems: "center",
                zIndex: 50,
              }}
              onClick={() => !creating && setShowPay(false)}
            >
              <div className="cardfx pay-modal" style={{ ...card, width: "min(720px, 92vw)", padding: 16 }} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ margin: 0, marginBottom: 8 }}>Pago</h3>

                <div className="pay-rows" style={{ display: "grid", gap: 8 }}>
                  {payments.map((p, i) => {
                    const isTransfer = p.method === "TRANSFER";
                    const gridCols = isTransfer ? "150px 160px 1fr 1fr auto" : "150px 1fr 1fr auto";
                    return (
                      <div
                        key={i}
                        className="pay-row"
                        style={{
                          display: "grid",
                          gridTemplateColumns: gridCols,
                          gap: 8,
                          alignItems: "center",
                          border: "1px solid #e5e7eb",
                          borderRadius: 12,
                          padding: 8,
                          background: "#fff",
                        }}
                      >
                        <select
                          value={p.method}
                          onChange={(e) => {
                            const v = e.currentTarget.value as Payment["method"];
                            setPayments((prev) =>
                              prev.map((x, idx) =>
                                idx === i ? { ...x, method: v, provider: v === "TRANSFER" ? x.provider || "NEQUI" : null } : x
                              )
                            );
                          }}
                          style={input}
                        >
                          <option value="CASH">Efectivo</option>
                          <option value="CARD">Tarjeta</option>
                          <option value="TRANSFER">Transferencia</option>
                          <option value="OTHER">Otro</option>
                        </select>

                        {isTransfer && (
                          <select
                            value={p.provider || "NEQUI"}
                            onChange={(e) => {
                              const v = e.currentTarget.value as TransferProvider;
                              setPayments((prev) => prev.map((x, idx) => (idx === i ? { ...x, provider: v } : x)));
                            }}
                            style={input}
                          >
                            <option value="NEQUI">Transferencia Nequi</option>
                            <option value="DAVIPLATA">Transferencia Daviplata</option>
                          </select>
                        )}

                        <input
                          type="number"
                          inputMode="numeric"
                          step={100}
                          min={0}
                          value={p.amount}
                          onChange={(e) => {
                            const n = Number(e.currentTarget.value);
                            const clean = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
                            setPayments((prev) => prev.map((x, idx) => (idx === i ? { ...x, amount: clean } : x)));
                          }}
                          placeholder="Monto"
                          style={input}
                        />

                        <input
                          value={p.reference || ""}
                          onChange={(e) => setPayments((prev) => prev.map((x, idx) => (idx === i ? { ...x, reference: e.currentTarget.value } : x)))}
                          placeholder="Referencia"
                          style={input}
                        />

                        <button
                          onClick={() => setPayments((prev) => prev.filter((_, idx) => idx !== i))}
                          disabled={payments.length <= 1}
                          style={{
                            ...btn,
                            opacity: payments.length > 1 ? 1 : 0.7,
                            cursor: payments.length > 1 ? "pointer" : "not-allowed",
                          }}
                          className="btn-animate"
                        >
                          Quitar
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={() => {
                      const remaining = Math.max(0, payPreview.due - payPreview.paid);
                      const amount = remaining > 0 ? remaining : 0;
                      setPayments((prev) => [...prev, { method: "CARD", amount }]);
                    }}
                    style={btnSoft}
                    className="btn-animate"
                  >
                    Añadir pago
                  </button>
                  <button
                    onClick={() => setPayments([{ method: "CASH", amount: cartStats.total }])}
                    style={btnSoft}
                    className="btn-animate"
                  >
                    Efectivo exacto
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "#fff" }}>
                    <div style={{ color: MUTED }}>Pagado</div>
                    <div style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{COP.format(payPreview.paid)}</div>
                  </div>

                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "#fff" }}>
                    <div style={{ color: MUTED }}>Restante</div>
                    <div style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{COP.format(payPreview.remaining)}</div>
                  </div>

                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "#fff" }}>
                    <div style={{ color: MUTED }}>Cambio</div>
                    <div style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{COP.format(payPreview.change)}</div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button onClick={() => setShowPay(false)} disabled={creating} style={btn} className="btn-animate">
                    Cancelar
                  </button>
                  <button
                    onClick={createSale}
                    disabled={creating || cart.length === 0 || (payPreview.due > 0 && payPreview.paid < payPreview.due)}
                    style={{ ...btnPrimary, opacity: creating || cart.length === 0 || (payPreview.due > 0 && payPreview.paid < payPreview.due) ? 0.7 : 1 }}
                    className="btn-animate"
                  >
                    Confirmar venta
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

const localCss = `
  html, body { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  .sales-root { animation: pageIn 260ms ease both; }
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

  input:focus, select:focus, button:focus { outline: none; box-shadow: 0 0 0 3px rgba(${YRGB},0.18); border-color: rgba(${YRGB},0.65) !important; }

  .sale-toast-wrap{
    position: fixed;
    top: 16px;
    left: 0;
    right: 0;
    display: grid;
    place-items: center;
    z-index: 80;
    pointer-events: auto;
  }
  .sale-toast{
    width: min(520px, 92vw);
    animation: toastIn 220ms ease both;
    cursor: default;
  }
  @keyframes toastIn {
    from { opacity: 0; transform: translateY(-10px) scale(0.985); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .sale-toast-bar{
    height: 100%;
    width: 100%;
    border-radius: 999px;
    background: rgba(${YRGB},0.55);
    transform-origin: left center;
    animation: toastBar 5000ms linear both;
  }
  @keyframes toastBar {
    from { transform: scaleX(1); }
    to { transform: scaleX(0); }
  }

  .pay-modal .pay-rows { gap: 8px; }
  @media (max-width: 680px) {
    input, select, button { font-size: 16px; }
    .pay-modal .pay-row { grid-template-columns: 1fr !important; }
  }
  @media (orientation: landscape) and (max-height: 420px) {
    .sales-root { animation-duration: 180ms; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sales-root, .cardfx, .btn-animate, .sale-toast, .sale-toast-bar { animation: none !important; transition: none !important; }
  }
`;
