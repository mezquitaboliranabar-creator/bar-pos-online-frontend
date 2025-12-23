import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

/* ===== Tipos ===== */
type Role = "admin" | "vendedor";
type Me = { id: number; username: string; name: string; role: Role } | null;

type ProductKind = "STANDARD" | "ACCOMP" | "BASE";

type Product = {
  id: number | string;
  name: string;
  category: string;
  price: number;
  stock: number;
  min_stock: number;
  is_active: number;
  kind?: ProductKind;
  measure?: string | null;
};

type ListResp = { ok: boolean; items: Product[]; total?: number; error?: string };
type MutResp = { ok: boolean; item?: Product; error?: string };
type CatResp = { ok: boolean; items: { category: string; n: number }[]; error?: string };

type ApiResp<T = any> = { ok: boolean; error?: string } & T;

type ListParams = {
  q?: string;
  includeInactive?: boolean;
  limit?: number;
  offset?: number;
  kind?: ProductKind | "";
};

/* ===== Config API / Auth ===== */
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

/* Helper HTTP genérico */
type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

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
        error: `Respuesta no JSON (${res.status}) en ${path}: ${text.slice(0, 160)}`,
      } as ApiResp<T>;
    }
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) } as ApiResp<T>;
  }
}

/* ===== Helpers API ===== */
async function safeAuthMe(): Promise<ApiResp<{ user: Me }>> {
  return httpJSON("GET", "/api/auth/me", undefined, { auth: true });
}

/* Normalizar producto desde backend */
function mapProduct(raw: any): Product {
  const id = raw.id ?? raw._id ?? raw.product_id ?? raw.idProduct ?? "";
  const minStock = raw.min_stock ?? raw.minStock ?? 0;
  const isActive =
    typeof raw.is_active === "number"
      ? raw.is_active
      : raw.isActive === false
      ? 0
      : 1;

  return {
    id,
    name: raw.name ?? "",
    category: raw.category ?? "",
    price: Number(raw.price ?? 0),
    stock: Number(raw.stock ?? 0),
    min_stock: Number(minStock ?? 0),
    is_active: isActive,
    kind: raw.kind as ProductKind | undefined,
    measure: raw.measure ?? null,
  };
}

async function safeProductsList(params: ListParams): Promise<ListResp> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.includeInactive) qs.set("include_inactive", "1");
  if (typeof params.limit === "number") qs.set("limit", String(params.limit));
  if (typeof params.offset === "number") qs.set("offset", String(params.offset));
  if (params.kind) qs.set("kind", params.kind);

  const query = qs.toString();
  const res = await httpJSON<{ items?: any[]; total?: number }>(
    "GET",
    "/api/products" + (query ? `?${query}` : ""),
    undefined,
    { auth: true }
  );

  if (!res.ok) {
    return {
      ok: false,
      items: [],
      total: 0,
      error: res.error || "No se pudo cargar productos",
    };
  }

  const items = (res.items || []).map(mapProduct);
  const total = res.total ?? items.length;
  return { ok: true, items, total };
}

async function safeProductsCategories(): Promise<CatResp> {
  const res = await httpJSON<{ items?: any[] }>(
    "GET",
    "/api/products/categories",
    undefined,
    { auth: true }
  );
  if (!res.ok) {
    return {
      ok: false,
      items: [],
      error: res.error || "No se pudieron cargar categorías",
    };
  }
  return {
    ok: true,
    items: (res.items || []).map((c: any) => ({
      category: c.category ?? "",
      n: Number(c.n ?? 0),
    })),
  };
}

type ProductPayload = {
  name: string;
  category: string;
  price: number;
  min_stock: number;
  kind: ProductKind;
  measure?: string | null;
};

async function safeProductsCreate(payload: ProductPayload): Promise<MutResp> {
  const body = {
    ...payload,
    minStock: payload.min_stock,
  };
  const res = await httpJSON<{ item?: any }>(
    "POST",
    "/api/products",
    body,
    { auth: true }
  );
  if (!res.ok) {
    return { ok: false, error: res.error || "No fue posible crear el producto" };
  }
  return {
    ok: true,
    item: res.item ? mapProduct(res.item) : undefined,
  };
}

async function safeProductsUpdate(
  id: number | string,
  payload: ProductPayload & { is_active?: number }
): Promise<MutResp> {
  const body = {
    ...payload,
    minStock: payload.min_stock,
    isActive: payload.is_active === 1,
  };
  const res = await httpJSON<{ item?: any }>(
    "PUT",
    `/api/products/${id}`,
    body,
    { auth: true }
  );
  if (!res.ok) {
    return { ok: false, error: res.error || "No fue posible actualizar el producto" };
  }
  return {
    ok: true,
    item: res.item ? mapProduct(res.item) : undefined,
  };
}

async function safeProductsSetStatus(
  id: number | string,
  active: boolean
): Promise<MutResp> {
  const body = {
    isActive: active,
    is_active: active ? 1 : 0,
  };
  const res = await httpJSON<{ item?: any }>(
    "PUT",
    `/api/products/${id}`,
    body,
    { auth: true }
  );
  if (!res.ok) {
    return { ok: false, error: res.error || "No fue posible cambiar el estado" };
  }
  return {
    ok: true,
    item: res.item ? mapProduct(res.item) : undefined,
  };
}

async function safeProductsDelete(
  id: number | string
): Promise<{ ok: boolean; error?: string }> {
  const res = await httpJSON("DELETE", `/api/products/${id}`, undefined, {
    auth: true,
  });
  if (!res.ok) {
    return { ok: false, error: res.error || "No fue posible eliminar el producto" };
  }
  return { ok: true };
}

/* ===== Mapeos de etiquetas (ES <-> interno) ===== */
const KIND_LABEL_ES: Record<ProductKind, string> = {
  STANDARD: "Bebida por unidad",
  BASE: "Bebida para cóctel",
  ACCOMP: "Acompañamiento",
};
const KIND_ORDER: ProductKind[] = ["STANDARD", "BASE", "ACCOMP"];

/* ===== Estilos ===== */
const YRGB = "244,194,43";
const BG = "#f7f8fb";
const TEXT = "#222831";
const MUTED = "#6b7280";
const RADIUS = 14;

const shell: React.CSSProperties = {
  minHeight: "100vh",
  background: BG,
  color: TEXT,
  display: "flex",
};
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
const h1: React.CSSProperties = { margin: 0, fontSize: 28, fontWeight: 800 };
const subtitle: React.CSSProperties = { margin: 0, color: MUTED };

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

const inputWithIconWrap: React.CSSProperties = {
  position: "relative",
  minWidth: 0,
};
const leftIcon: React.CSSProperties = {
  position: "absolute",
  left: 10,
  top: "50%",
  transform: "translateY(-50%)",
  color: MUTED,
};
const inputWithIcon: React.CSSProperties = { ...input, paddingLeft: 36 };

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
const btnWarn: React.CSSProperties = {
  ...btn,
  borderColor: "rgba(255,107,107,0.35)",
  background: "rgba(255,107,107,0.08)",
  color: "#b00020",
  fontWeight: 700,
};
const btnOk: React.CSSProperties = {
  ...btn,
  borderColor: "rgba(46,125,50,0.35)",
  background: "rgba(46,125,50,0.12)",
  color: "#2e7d32",
  fontWeight: 700,
};
const btnDanger: React.CSSProperties = {
  ...btn,
  borderColor: "rgba(176,0,32,0.35)",
  background: "rgba(176,0,32,0.10)",
  color: "#b00020",
  fontWeight: 700,
};

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

/* ===== Moneda ===== */
const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/* ==== Breakpoints ==== */
function useBreakpoints() {
  const get = () => {
    if (typeof window === "undefined") return { narrow: false, veryNarrow: false };
    return {
      narrow: window.matchMedia("(max-width: 1120px)").matches,
      veryNarrow: window.matchMedia("(max-width: 880px)").matches,
    };
  };
  const [state, setState] = useState(get);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mqN = window.matchMedia("(max-width: 1120px)");
    const mqV = window.matchMedia("(max-width: 880px)");
    const onChange = () =>
      setState({ narrow: mqN.matches, veryNarrow: mqV.matches });
    if (typeof mqN.addEventListener === "function") {
      mqN.addEventListener("change", onChange);
      mqV.addEventListener("change", onChange);
      return () => {
        mqN.removeEventListener("change", onChange);
        mqV.removeEventListener("change", onChange);
      };
    } else {
      // @ts-ignore
      mqN.addListener(onChange);
      // @ts-ignore
      mqV.addListener(onChange);
      return () => {
        // @ts-ignore
        mqN.removeListener(onChange);
        // @ts-ignore
        mqV.removeListener(onChange);
      };
    }
  }, []);
  return state;
}

/* ===== Página ===== */
export default function ProductsPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me>(null);

  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [kindFilter, setKindFilter] = useState<ProductKind | "">("");
  const [includeInactive, setIncludeInactive] = useState<boolean>(false);

  const [items, setItems] = useState<Product[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [msg, setMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [minStock, setMinStock] = useState("");
  const [kind, setKind] = useState<ProductKind>("STANDARD");
  const [measure, setMeasure] = useState<string>("UNIT");
  const [saving, setSaving] = useState(false);

  const [delTarget, setDelTarget] = useState<Product | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [page, setPage] = useState(0);
  const perPage = 200;

  const { narrow, veryNarrow } = useBreakpoints();
  const SHOW_STATE_COL = !veryNarrow;

  /* Carga inicial: auth y datos */
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
        await loadCategories();
        await loadList(0);
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  /* Cargar categorías */
  const loadCategories = async () => {
    try {
      const r = await safeProductsCategories();
      if (r.ok) {
        setCats((r.items || []).map((x) => x.category || "Sin categoría"));
      }
    } catch {
      /* silencioso */
    }
  };

  /* Cargar lista de productos */
  const loadList = async (newPage = page) => {
    setMsg("");
    setOkMsg("");
    setLoadingList(true);
    try {
      const resp = await safeProductsList({
        q,
        includeInactive,
        limit: perPage,
        offset: newPage * perPage,
        kind: kindFilter || undefined,
      });
      if (resp.ok) {
        const arr = (resp.items || []).filter(
          (p) =>
            !categoryFilter ||
            (p.category || "Sin categoría").toLowerCase() ===
              categoryFilter.toLowerCase()
        );
        setItems(arr);
        setPage(newPage);
      } else {
        setMsg(resp.error || "No se pudo cargar productos");
      }
    } catch (e: any) {
      setMsg(String(e));
    } finally {
      setLoadingList(false);
    }
  };

  /* Parsear precio */
  const parseMoney = (s: string) =>
    Number((s || "").replace(/[^\d]/g, "")) || 0;

  /* Medidas por tipo */
  const measureOptions = useMemo(() => {
    if (kind === "BASE") return ["ML"];
    if (kind === "ACCOMP") return ["UNIT", "ML", "G"];
    return ["UNIT"];
  }, [kind]);

  /* Ajustar medida cuando cambia tipo */
  useEffect(() => {
    if (kind === "BASE") setMeasure("ML");
    else if (kind === "ACCOMP") {
      if (!["UNIT", "ML", "G"].includes((measure || "").toUpperCase())) {
        setMeasure("UNIT");
      }
    } else {
      setMeasure("UNIT");
    }
  }, [kind, measure]);

  /* Abrir crear */
  const openCreate = () => {
    setEditing(null);
    setName("");
    setCategory("");
    setPrice("");
    setMinStock("");
    setKind("STANDARD");
    setMeasure("UNIT");
    setOpenForm(true);
    setMsg("");
  };

  /* Abrir editar */
  const openEdit = (p: Product) => {
    setEditing(p);
    setName(p.name);
    setCategory(p.category || "");
    setPrice(String(Math.round(p.price || 0)));
    setMinStock(String(p.min_stock || 0));
    setKind((p.kind as ProductKind) || "STANDARD");
    const m0 = (p.measure || "").toUpperCase();
    if ((p.kind || "STANDARD") === "BASE") setMeasure("ML");
    else if ((p.kind || "STANDARD") === "ACCOMP")
      setMeasure(["UNIT", "ML", "G"].includes(m0) ? m0 : "UNIT");
    else setMeasure("UNIT");
    setOpenForm(true);
    setMsg("");
  };

  /* Cerrar modal */
  const closeForm = () => {
    if (!saving) setOpenForm(false);
  };

  const canSave =
    name.trim().length > 0 &&
    Number.isFinite(parseMoney(price)) &&
    me?.role === "admin";

  /* Guardar producto */
  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setMsg("");
    setOkMsg("");

    const payload: ProductPayload & { is_active?: number } = {
      name: name.trim(),
      category: category.trim(),
      price: parseMoney(price),
      min_stock: Math.max(0, parseInt(minStock || "0", 10)),
      kind,
      measure: (measure || "").toUpperCase(),
      is_active: editing ? editing.is_active : 1,
    };

    try {
      const r: MutResp | undefined = editing
        ? await safeProductsUpdate(editing.id, payload)
        : await safeProductsCreate(payload);
      if (r?.ok && r.item) {
        setOpenForm(false);
        setOkMsg(editing ? "Producto actualizado" : "Producto creado");
        await loadList(0);
      } else {
        setMsg(r?.error || "No fue posible guardar");
      }
    } catch (e: any) {
      setMsg(String(e));
    } finally {
      setSaving(false);
    }
  };

  /* Cambiar estado activo */
  const toggleActive = async (p: Product) => {
    if (me?.role !== "admin") return;
    const next = p.is_active !== 1;
    if (
      !window.confirm(
        next ? `¿Activar ${p.name}?` : `¿Bloquear ${p.name}?`
      )
    )
      return;
    const r = await safeProductsSetStatus(p.id, next);
    if (r.ok && r.item) {
      const updated = r.item;
      setItems((prev) =>
        prev.map((x) => (x.id === updated.id ? updated : x))
      );
    } else {
      setMsg(r.error || "No se pudo actualizar estado");
    }
  };

  /* Eliminar producto */
  const openDelete = (p: Product) => {
    if (me?.role !== "admin") return;
    setDelTarget(p);
    setConfirmText("");
  };
  const closeDelete = () => {
    if (!deleting) {
      setDelTarget(null);
      setConfirmText("");
    }
  };
  const submitDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!delTarget || me?.role !== "admin") return;
    if (confirmText.trim() !== delTarget.name) {
      setMsg("Escribe exactamente el nombre del producto");
      return;
    }
    setDeleting(true);
    setMsg("");
    setOkMsg("");
    try {
      const r = await safeProductsDelete(delTarget.id);
      if (r.ok) {
        setItems((prev) => prev.filter((x) => x.id !== delTarget.id));
        closeDelete();
        setOkMsg("Producto eliminado");
      } else {
        setMsg(r.error || "No fue posible eliminar");
      }
    } catch (e: any) {
      setMsg(String(e));
    } finally {
      setDeleting(false);
    }
  };

  /* Filtro local de búsqueda */
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        (p.category || "").toLowerCase().includes(s)
    );
  }, [items, q]);

  /* Grid sin columna de stock */
  const GRID_LIST = veryNarrow
    ? "minmax(220px,1.8fr) minmax(140px,1.1fr) 100px minmax(190px,1.4fr)"
    : narrow
    ? "minmax(260px,1.8fr) minmax(160px,1.2fr) 120px 100px minmax(200px,1.2fr)"
    : "minmax(280px,1.8fr) minmax(180px,1.1fr) 140px 110px minmax(220px,1.2fr)";

  return (
    <div style={shell}>
      <div style={main}>
        <div style={container}>
          {/* Header */}
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
                <h1 style={h1}>PRODUCTOS</h1>
                <p style={subtitle}>Catálogo y Categorías</p>
              </div>
            </div>
            <div />
          </header>

          {/* Mensajes */}
          {okMsg && (
            <div
              className="fx-card"
              style={{
                ...card,
                padding: 10,
                borderLeft: "4px solid #2e7d32",
                marginBottom: 12,
              }}
            >
              {okMsg}
            </div>
          )}
          {msg && (
            <div
              className="fx-card"
              style={{
                ...card,
                padding: 10,
                borderLeft: "4px solid #b00020",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>{msg}</span>
                <button
                  className="fx-btn"
                  style={{ ...btn, padding: "6px 10px" }}
                  onClick={() => setMsg("")}
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {/* Filtros */}
          <div
            className="fx-card"
            style={{ ...card, padding: 14, marginBottom: 12 }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(160px, 1fr))",
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") loadList(0);
                  }}
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.currentTarget.value)
                }
                className="fx-input"
                style={input}
              >
                <option value="">Todas</option>
                {cats.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                value={kindFilter}
                onChange={(e) =>
                  setKindFilter(e.currentTarget.value as any)
                }
                className="fx-input"
                style={input}
              >
                <option value="">Todos los tipos</option>
                {KIND_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL_ES[k]}
                  </option>
                ))}
              </select>

              <label
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  color: MUTED,
                  fontSize: 14,
                }}
              >
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) =>
                    setIncludeInactive(e.currentTarget.checked)
                  }
                />
                Mostrar inactivos
              </label>
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
                    setCategoryFilter("");
                    setQ("");
                    setKindFilter("");
                    loadList(0);
                  }}
                >
                  Limpiar
                </button>
                <button
                  className="fx-btn"
                  style={btn}
                  onClick={() => loadList(0)}
                >
                  Buscar
                </button>
                {me?.role === "admin" && (
                  <button
                    className="fx-btn"
                    style={btnPrimary}
                    onClick={openCreate}
                  >
                    Nuevo producto
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Tabla */}
          <div className="fx-card" style={card}>
            <div
              style={{
                ...sectionTitle,
                borderBottom: "1px solid #eef0f4",
              }}
            >
              Catálogo
            </div>

            <div style={tableHead}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: GRID_LIST,
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={th}>Producto</div>
                <div style={th}>Categoría</div>
                <div style={{ ...th, textAlign: "right" }}>Precio</div>
                {SHOW_STATE_COL && (
                  <div style={{ ...th, textAlign: "center" }}>Estado</div>
                )}
                <div
                  style={{
                    ...th,
                    textAlign: "right",
                  }}
                >
                  {SHOW_STATE_COL ? "Acciones" : "Estado / Acciones"}
                </div>
              </div>
            </div>

            {loadingList ? (
              <div style={{ padding: 16 }}>Cargando productos…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 16 }}>No hay resultados</div>
            ) : (
              filtered.map((p, i) => (
                <div
                  key={p.id}
                  className="fx-row"
                  style={{
                    ...rowBase,
                    display: "grid",
                    gridTemplateColumns: GRID_LIST,
                    gap: 10,
                    alignItems: "center",
                    animationDelay: `${i * 0.01}s`,
                  }}
                >
                  <div
                    style={{
                      ...td,
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <span>{p.name}</span>
                    <KindBadge
                      kind={(p.kind as ProductKind) || "STANDARD"}
                      label={
                        KIND_LABEL_ES[
                          (p.kind as ProductKind) || "STANDARD"
                        ]
                      }
                    />
                  </div>
                  <div style={td}>{p.category || "Sin categoría"}</div>
                  <div style={{ ...td, textAlign: "right" }}>
                    {COP.format(p.price || 0)}
                  </div>
                  {SHOW_STATE_COL && (
                    <div style={{ ...td, textAlign: "center" }}>
                      <StatusBadge active={p.is_active === 1} />
                    </div>
                  )}
                  <div
                    style={{
                      ...td,
                      display: "flex",
                      gap: 8,
                      justifyContent: "flex-end",
                      flexWrap: "wrap",
                    }}
                  >
                    {!SHOW_STATE_COL && (
                      <StatusBadge active={p.is_active === 1} />
                    )}
                    {me?.role === "admin" && (
                      <>
                        <button
                          className="fx-btn"
                          style={btnSoft}
                          onClick={() => openEdit(p)}
                        >
                          Editar
                        </button>
                        <button
                          className="fx-btn"
                          style={p.is_active ? btnWarn : btnOk}
                          onClick={() => toggleActive(p)}
                        >
                          {p.is_active ? "Bloquear" : "Activar"}
                        </button>
                        <button
                          className="fx-btn"
                          style={btnDanger}
                          onClick={() => openDelete(p)}
                        >
                          Eliminar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}

            {/* Paginación */}
            <div
              className="fx-row"
              style={{
                padding: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div style={{ color: MUTED, fontSize: 13 }}>
                Página {page + 1}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="fx-btn"
                  style={btn}
                  disabled={page === 0}
                  onClick={() => loadList(Math.max(0, page - 1))}
                >
                  Anterior
                </button>
                <button
                  className="fx-btn"
                  style={btn}
                  onClick={() => loadList(page + 1)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>

          {/* Modal Crear/Editar */}
          {openForm && (
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
              onClick={closeForm}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="fx-modal"
                style={{ ...card, width: "min(620px, 92vw)", padding: 16 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ margin: "0 0 8px" }}>
                  {editing ? "Editar producto" : "Nuevo producto"}
                </h3>
                <form
                  onSubmit={submitForm}
                  style={{ display: "grid", gap: 10 }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div>
                      <label
                        style={{ fontSize: 13, color: MUTED }}
                      >
                        Nombre
                      </label>
                      <div style={inputWithIconWrap}>
                        <span style={leftIcon}>
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            <path d="M3.27 6.96 12 12l8.73-5.04M12 22V12" />
                          </svg>
                        </span>
                        <input
                          className="fx-input"
                          value={name}
                          onChange={(e) =>
                            setName(e.currentTarget.value)
                          }
                          style={inputWithIcon}
                          placeholder="Nombre del producto"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label
                        style={{ fontSize: 13, color: MUTED }}
                      >
                        Categoría
                      </label>
                      <div style={inputWithIconWrap}>
                        <span style={leftIcon}>
                          <ITag />
                        </span>
                        <input
                          className="fx-input"
                          value={category}
                          onChange={(e) =>
                            setCategory(e.currentTarget.value)
                          }
                          style={inputWithIcon}
                          placeholder="Bebidas, Snacks, etc."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Precio / stock mínimo / tipo / medida */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div>
                      <label
                        style={{ fontSize: 13, color: MUTED }}
                      >
                        Precio (COP)
                      </label>
                      <input
                        className="fx-input"
                        value={price}
                        onChange={(e) =>
                          setPrice(
                            e.currentTarget.value.replace(/[^\d]/g, "")
                          )
                        }
                        style={input}
                        inputMode="numeric"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label
                        style={{ fontSize: 13, color: MUTED }}
                      >
                        Stock mínimo
                      </label>
                      <input
                        className="fx-input"
                        value={minStock}
                        onChange={(e) =>
                          setMinStock(
                            e.currentTarget.value.replace(/\D/g, "")
                          )
                        }
                        style={input}
                        inputMode="numeric"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label
                        style={{ fontSize: 13, color: MUTED }}
                      >
                        Tipo
                      </label>
                      <select
                        className="fx-input"
                        style={input}
                        value={kind}
                        onChange={(e) =>
                          setKind(e.currentTarget.value as ProductKind)
                        }
                      >
                        {KIND_ORDER.map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABEL_ES[k]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        style={{ fontSize: 13, color: MUTED }}
                      >
                        Unidad de medida
                      </label>
                      <select
                        className="fx-input"
                        style={input}
                        value={(measure || "").toUpperCase()}
                        onChange={(e) =>
                          setMeasure(
                            e.currentTarget.value.toUpperCase()
                          )
                        }
                        disabled={kind === "BASE"}
                        title="Unidad de medida"
                      >
                        {measureOptions.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <div
                        style={{
                          fontSize: 11,
                          color: MUTED,
                          marginTop: 4,
                        }}
                      >
                        {kind === "BASE"
                          ? "BASE requiere ML."
                          : kind === "ACCOMP"
                          ? "ACCOMP permite UNIT, ML o G."
                          : "STANDARD usa UNIT."}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      justifyContent: "flex-end",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      className="fx-btn"
                      style={btn}
                      onClick={closeForm}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="fx-btn"
                      style={btnPrimary}
                      disabled={!canSave || saving}
                    >
                      {saving ? "Guardando…" : "Guardar"}
                    </button>
                  </div>
                  <div style={{ color: MUTED, fontSize: 12 }}>
                    Tip: Los ajustes de <b>stock</b> se gestionan en{" "}
                    <b>Inventario</b>.
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal Eliminar */}
          {delTarget && (
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
              onClick={closeDelete}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="fx-modal"
                style={{ ...card, width: "min(520px, 92vw)", padding: 16 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ margin: "0 0 8px" }}>Eliminar producto</h3>
                <p
                  style={{
                    margin: "0 0 10px",
                    color: MUTED,
                  }}
                >
                  Escribe el nombre del producto{" "}
                  <b>{delTarget.name}</b> para confirmar.
                </p>
                <form
                  onSubmit={submitDelete}
                  style={{ display: "grid", gap: 10 }}
                >
                  <input
                    className="fx-input"
                    value={confirmText}
                    onChange={(e) =>
                      setConfirmText(e.currentTarget.value)
                    }
                    style={input}
                    autoFocus
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
                      type="button"
                      className="fx-btn"
                      style={btn}
                      onClick={closeDelete}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="fx-btn"
                      style={btnDanger}
                      disabled={deleting}
                    >
                      {deleting ? "Eliminando…" : "Eliminar"}
                    </button>
                  </div>
                </form>
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

/* ===== Badges ===== */
function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      style={{
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.3,
        color: active ? "#2e7d32" : "#b00020",
        background: active
          ? "rgba(46,125,50,.12)"
          : "rgba(176,0,32,.10)",
        border: active
          ? "1px solid rgba(46,125,50,.35)"
          : "1px solid rgba(176,0,32,.28)",
        textAlign: "center",
      }}
    >
      {active ? "Activo" : "Bloqueado"}
    </span>
  );
}

function KindBadge({ kind, label }: { kind: ProductKind; label: string }) {
  const base: React.CSSProperties = {
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.4,
    border: "1px solid transparent",
    lineHeight: "16px",
  };
  if (kind === "BASE") {
    return (
      <span
        style={{
          ...base,
          color: "#0b5",
          background: "rgba(0,187,85,.10)",
          borderColor: "rgba(0,187,85,.28)",
        }}
      >
        {label}
      </span>
    );
  }
  if (kind === "ACCOMP") {
    return (
      <span
        style={{
          ...base,
          color: "#0a66c2",
          background: "rgba(10,102,194,.10)",
          borderColor: "rgba(10,102,194,.28)",
        }}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      style={{
        ...base,
        color: "#6b5b00",
        background: "rgba(244,194,43,.12)",
        borderColor: "rgba(244,194,43,.38)",
      }}
    >
      {label}
    </span>
  );
}
