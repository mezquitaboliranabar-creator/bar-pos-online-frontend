import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/* ===== Tipos ===== */
type Role = "admin" | "vendedor";
type Me = { id: number; username: string; name: string; role: Role } | null;

type InvType = "UNIT" | "BASE" | "ACCOMP" | "COCKTAIL";
type Kind = "STANDARD" | "BASE" | "ACCOMP" | "COCKTAIL";

type Product = {
  id: number | string;
  name: string;
  category: string;
  price: number;
  stock: number;
  min_stock: number;
  is_active: number;
  inv_type?: InvType | null;
  measure?: string | null;
  kind?: Kind | null;
};

type ListResp = { ok: boolean; items: Product[]; total?: number; error?: string };

type RecipeLine = {
  ingredient_id: number | string | "";
  qty: string;
  role: "BASE" | "ACCOMP";
  unit: string;
  note: string;
};

type RecipeGetResp = {
  ok: boolean;
  product?: {
    id: number | string;
    name: string;
    category?: string | null;
    kind?: string | null;
    inv_type?: string | null;
    measure?: string | null;
  } | null;
  items: Array<{
    id: number | string;
    product_id: number | string;
    ingredient_id: number | string;
    qty: number;
    unit?: string | null;
    note?: string | null;
    ingredient_name?: string | null;
    role?: "BASE" | "ACCOMP" | null;
  }>;
  total?: number;
  error?: string;
};

/* ===== Utils ===== */
const mapKindToInvType = (k?: string | null): InvType => {
  const kk = String(k || "STANDARD").trim().toUpperCase();
  if (kk === "BASE") return "BASE";
  if (kk === "ACCOMP") return "ACCOMP";
  if (kk === "COCKTAIL") return "COCKTAIL";
  return "UNIT";
};

/* ===== Estilos/const ===== */
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

/* ===== Estilos base ===== */
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
const card: React.CSSProperties = {
  borderRadius: RADIUS,
  background: "#fff",
  border: "1px solid #e5e7eb",
  boxShadow: "0 10px 28px rgba(0,0,0,0.05)",
  overflow: "hidden",
};
const header: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
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
const titleRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
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
const sectionTitle: React.CSSProperties = {
  padding: "14px 16px",
  fontWeight: 800,
};
const rowBase: React.CSSProperties = {
  padding: "12px 16px",
  borderTop: "1px solid #f0f1f5",
};
const tableHead: React.CSSProperties = {
  padding: "10px 16px",
  borderBottom: "1px solid #eef0f4",
  background: "#fafafc",
};
const th: React.CSSProperties = {
  fontSize: 13,
  color: "#333",
  fontWeight: 700,
};
const td: React.CSSProperties = {
  fontSize: 14,
  color: "#111",
  minWidth: 0,
  wordBreak: "break-word" as any,
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
const inputWithIcon: React.CSSProperties = {
  ...input,
  paddingLeft: 36,
};

/* ===== HTTP helpers (online) ===== */
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

/* Auth */
async function safeAuthMe(): Promise<ApiResp<{ user: Me }>> {
  return httpJSON("GET", "/api/auth/me", undefined, { auth: true });
}

/* Productos */
type ListParams = {
  q?: string;
  kind?: string;
  limit?: number;
};

function mapProduct(raw: any): Product {
  const id = raw.id ?? raw._id ?? raw.product_id ?? raw.idProduct ?? 0;
  const minStock = raw.min_stock ?? raw.minStock ?? 0;
  const isActive =
    typeof raw.is_active === "number"
      ? raw.is_active
      : raw.isActive === false
      ? 0
      : 1;

  const invType =
    (raw.inv_type as InvType | null | undefined) ||
    mapKindToInvType(raw.kind as string | null | undefined);

  return {
    id,
    name: raw.name ?? "",
    category: raw.category ?? "",
    price: Number(raw.price ?? 0) || 0,
    stock: Number(raw.stock ?? 0) || 0,
    min_stock: Number(minStock) || 0,
    is_active: Number(isActive),
    inv_type: invType,
    measure: raw.measure ?? null,
    kind: (raw.kind as Kind) ?? null,
  };
}

async function safeProductsList(params: ListParams): Promise<ListResp> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.kind) qs.set("kind", params.kind);
  if (typeof params.limit === "number") qs.set("limit", String(params.limit));

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

type ProductPayload = {
  name: string;
  category: string;
  price: number;
  min_stock: number;
  kind?: string;
};

type MutResp = { ok: boolean; item?: Product; error?: string };

async function safeProductsCreate(payload: ProductPayload): Promise<MutResp> {
  const body = {
    name: payload.name,
    category: payload.category,
    price: payload.price,
    kind: payload.kind,
    minStock: payload.min_stock,
  };

  const res = await httpJSON<{ item?: any }>("POST", "/api/products", body, {
    auth: true,
  });

  if (!res.ok) {
    return {
      ok: false,
      error: res.error || "No fue posible crear el cóctel",
    };
  }

  const raw = (res as any).item ?? (res as any).product ?? res;
  return { ok: true, item: mapProduct(raw) };
}

/* Recetas HTTP */
type RecipeItemPayload = {
  ingredient_id: number | string;
  qty: number;
  role: "BASE" | "ACCOMP";
  unit?: string;
  note?: string;
};

async function safeRecipeGet(
  productId: number | string
): Promise<RecipeGetResp> {
  const res = await httpJSON<RecipeGetResp>(
    "GET",
    `/api/recipes/${productId}`,
    undefined,
    { auth: true }
  );
  if (!res.ok) {
    return {
      ok: false,
      items: [],
      error: res.error || "No se pudo cargar la receta",
    };
  }
  return {
    ok: true,
    items: res.items || [],
    product: res.product,
    total: res.total,
  };
}

async function safeRecipeSet(
  productId: number | string,
  items: RecipeItemPayload[]
): Promise<{ ok: boolean; error?: string }> {
  const body = {
    items: items.map((it) => ({
      ingredient_id: it.ingredient_id,
      qty: it.qty,
      role: it.role,
      unit: it.unit,
      note: it.note,
    })),
  };

  const res = await httpJSON<RecipeGetResp>(
    "PUT",
    `/api/recipes/${productId}`,
    body,
    { auth: true }
  );

  if (!res.ok) {
    return {
      ok: false,
      error: res.error || "No fue posible guardar la receta",
    };
  }

  return { ok: true };
}

/* ===== Unidades ===== */
const unitOptionsFor = (p?: Product) => {
  const inv = String(p?.inv_type || "UNIT").toUpperCase() as InvType;
  const meas = String(
    p?.measure || (inv === "BASE" ? "ML" : inv === "ACCOMP" ? "UNIT" : "UNIT")
  ).toUpperCase();
  if (inv === "BASE") return ["ML", "L", "CL", "OZ", "SHOT"];
  if (inv === "ACCOMP") {
    if (meas === "ML") return ["ML", "L", "CL", "OZ", "SHOT"];
    if (meas === "G") return ["G", "KG", "LB"];
    return ["UNIT"];
  }
  return ["UNIT"];
};

const defaultUnitsFor = (p?: Product) => {
  const inv = String(p?.inv_type || "UNIT").toUpperCase() as InvType;
  const meas = String(
    p?.measure || (inv === "BASE" ? "ML" : inv === "ACCOMP" ? "UNIT" : "UNIT")
  ).toUpperCase();
  if (inv === "BASE") return { qtyUnit: "ML" };
  if (inv === "ACCOMP") {
    if (meas === "ML") return { qtyUnit: "ML" };
    if (meas === "G") return { qtyUnit: "G" };
    return { qtyUnit: "UNIT" };
  }
  return { qtyUnit: "UNIT" };
};

/* ===== Helpers ===== */
const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/* ===== Página ===== */
export default function RecipesPage() {
  const navigate = useNavigate();

  /* sesión */
  const [me, setMe] = useState<Me>(null);

  /* listado recetas */
  const [q, setQ] = useState("");
  const [cocktails, setCocktails] = useState<Product[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  /* crear cóctel */
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Cocteles");
  const [newPrice, setNewPrice] = useState("");
  const [newMinStock, setNewMinStock] = useState("");
  const [creating, setCreating] = useState(false);
  const lastCreatedName = useRef<string>("");

  /* edición receta */
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [recipeTarget, setRecipeTarget] = useState<Product | null>(null);
  const [recipeLines, setRecipeLines] = useState<RecipeLine[]>([]);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState(false);

  /* opciones ingredientes + índice fiable */
  const [baseOptions, setBaseOptions] = useState<Product[]>([]);
  const [accompOptions, setAccompOptions] = useState<Product[]>([]);
  const [typeIndex, setTypeIndex] = useState<Map<string, InvType>>(new Map());

  /* mensajes */
  const [msg, setMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const canMutate = me?.role === "admin";

  const flashOk = (text: string, ms = 2200) => {
    setOkMsg(text);
    window.setTimeout(() => setOkMsg(""), ms);
  };

  /* mapear sólo cócteles */
  const mapAndFilterCocktails = useCallback((arr: Product[]) => {
    return (arr || [])
      .map((p) => ({
        ...p,
        inv_type:
          (p.inv_type as InvType | null | undefined) ||
          mapKindToInvType(p.kind as string | null | undefined),
      }))
      .filter((p) => (p.inv_type || "UNIT") === "COCKTAIL");
  }, []);

  /* cargar cócteles (HTTP) */
  const loadCocktails = useCallback(async () => {
    setLoadingList(true);
    try {
      let list: Product[] = [];

      const rKind: ListResp = await safeProductsList({
        q,
        kind: "COCKTAIL",
        limit: 5000,
      });
      if (rKind.ok && rKind.items?.length) {
        list = mapAndFilterCocktails(rKind.items);
      } else {
        const rAll: ListResp = await safeProductsList({ q, limit: 5000 });
        if (rAll.ok && rAll.items?.length) {
          list = mapAndFilterCocktails(rAll.items);
        }
      }

      setCocktails(list);
    } catch {
      setCocktails([]);
    } finally {
      setLoadingList(false);
    }
  }, [q, mapAndFilterCocktails]);

  /* cargar sesión + listado */
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
        await loadCocktails();
      } catch (e: any) {
        setMsg(String(e?.message || e));
      }
    })();
  }, [navigate, loadCocktails]);

  /* abrir receta: carga productos, filtra BASE/ACCOMP y arma índice; luego pide la receta */
  const openRecipe = async (p: Product) => {
    setRecipeTarget(p);
    setRecipeModalOpen(true);
    setRecipeLines([]);
    setRecipeLoading(true);
    setMsg("");

    try {
      const prodsResp = await safeProductsList({ q: "", limit: 5000 });

      if (!prodsResp.ok) {
        setMsg(
          prodsResp.error || "Error al cargar ingredientes disponibles."
        );
        return;
      }

      const allProducts = (prodsResp.items || []).map((prod) => ({
        ...prod,
        inv_type:
          (prod.inv_type as InvType | null | undefined) ||
          mapKindToInvType(prod.kind as string | null | undefined),
      }));

      const baseArr: Product[] = [];
      const accompArr: Product[] = [];
      const idx = new Map<string, InvType>();

      for (const prod of allProducts) {
        const invType = (prod.inv_type || "UNIT") as InvType;
        if (invType === "BASE") {
          baseArr.push(prod);
          idx.set(String(prod.id), "BASE");
        } else if (invType === "ACCOMP") {
          accompArr.push(prod);
          idx.set(String(prod.id), "ACCOMP");
        }
      }

      setBaseOptions(baseArr);
      setAccompOptions(accompArr);
      setTypeIndex(idx);

      const r = await safeRecipeGet(p.id);
      const mapped: RecipeLine[] = (r?.ok ? r.items : []).map((it) => {
        const key = String(it.ingredient_id ?? "");
        const role =
          (it.role as "BASE" | "ACCOMP") ||
          (idx.get(key) as "BASE" | "ACCOMP") ||
          "BASE";
        return {
          ingredient_id: it.ingredient_id ?? "",
          qty: String(it.qty ?? ""),
          role,
          unit: (it.unit || "").toUpperCase(),
          note: it.note || "",
        };
      });
      setRecipeLines(mapped);
    } catch (e: any) {
      setMsg(String(e));
    } finally {
      setRecipeLoading(false);
    }
  };

  const closeRecipe = () => {
    setRecipeModalOpen(false);
    setRecipeTarget(null);
    setRecipeLines([]);
  };

  /* líneas receta */
  const addRecipeLine = () =>
    setRecipeLines((prev) => [
      ...prev,
      { ingredient_id: "", qty: "", role: "BASE", unit: "", note: "" },
    ]);
  const rmRecipeLine = (idx: number) =>
    setRecipeLines((prev) => prev.filter((_, i) => i !== idx));
  const updRecipeLine = (idx: number, patch: Partial<RecipeLine>) =>
    setRecipeLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, ...patch } : l))
    );

  /* seleccionar ingrediente: fuerza tipo real y unidad por defecto */
  const onSelectIngredient = (idx: number, idStr: string) => {
    const key = idStr || "";
    if (!key) {
      updRecipeLine(idx, { ingredient_id: "", unit: "" });
      return;
    }
    const t = typeIndex.get(key);
    if (t === "BASE" || t === "ACCOMP") {
      const src = t === "BASE" ? baseOptions : accompOptions;
      const pr = src.find((p) => String(p.id) === key);
      const def = defaultUnitsFor(pr);
      updRecipeLine(idx, {
        ingredient_id: pr ? pr.id : key,
        role: t,
        unit: def.qtyUnit,
      });
      return;
    }
    updRecipeLine(idx, { ingredient_id: "", unit: "" });
  };

  /* cambiar rol limpia selección para evitar inconsistencias */
  const onChangeRole = (idx: number, role: "BASE" | "ACCOMP") => {
    updRecipeLine(idx, { role, ingredient_id: "", unit: "" });
  };

  /* validar + normalizar según reglas del backend */
  const normalizeAndValidate = ():
    | {
        ok: true;
        items: Array<{
          ingredient_id: number | string;
          qty: number;
          role: "BASE" | "ACCOMP";
          unit?: string;
          note?: string;
        }>;
      }
    | { ok: false; error: string } => {
    const out: Array<{
      ingredient_id: number | string;
      qty: number;
      role: "BASE" | "ACCOMP";
      unit?: string;
      note?: string;
    }> = [];

    for (let i = 0; i < recipeLines.length; i++) {
      const l = recipeLines[i];
      const key = String(l.ingredient_id || "");
      const qty = Number(
        String(l.qty).replace(/[^\d.\-.,]/g, "").replace(",", ".")
      );
      if (!key || !Number.isFinite(qty) || qty <= 0) continue;

      const t = typeIndex.get(key);
      if (t !== "BASE" && t !== "ACCOMP") {
        return {
          ok: false,
          error: `Línea ${i + 1}: el ingrediente seleccionado no es válido (debe ser Bebida base o Acompañamiento).`,
        };
      }

      const src = t === "BASE" ? baseOptions : accompOptions;
      const pr = src.find((p) => String(p.id) === key);
      const allowedUnits = unitOptionsFor(pr);
      const selUnit = (l.unit || "").toUpperCase().trim();
      const unit =
        selUnit && allowedUnits.includes(selUnit)
          ? selUnit
          : defaultUnitsFor(pr)?.qtyUnit || undefined;

      out.push({
        ingredient_id: pr ? pr.id : l.ingredient_id || key,
        qty: Math.round(qty * 1000) / 1000,
        role: t,
        unit,
        note: l.note?.trim() || undefined,
      });
    }

    if (out.length === 0)
      return { ok: false, error: "Agrega al menos un ingrediente válido." };
    return { ok: true, items: out };
  };

  /* guardar receta vía HTTP */
  const saveRecipe = async () => {
    if (!recipeTarget) return;
    if (!canMutate) {
      setMsg("Solo un administrador puede guardar recetas.");
      return;
    }

    const norm = normalizeAndValidate();
    if (!norm.ok) {
      setMsg(norm.error);
      return;
    }

    setSavingRecipe(true);
    setMsg("");
    setOkMsg("");

    try {
      const r = await safeRecipeSet(recipeTarget.id, norm.items);
      if (r.ok) {
        flashOk("Receta guardada");
        closeRecipe();
      } else {
        setMsg(r.error || "No fue posible guardar la receta");
      }
    } catch (e: any) {
      setMsg(String(e));
    } finally {
      setSavingRecipe(false);
    }
  };

  const openCreate = () => {
    setCreateOpen(true);
    setNewName("");
    setNewCategory("Cocteles");
    setNewPrice("");
    setNewMinStock("");
  };
  const closeCreate = () => setCreateOpen(false);

  const tryOpenByName = async (name: string) => {
    try {
      const res = await safeProductsList({
        q: name,
        kind: "COCKTAIL",
        limit: 50,
      });
      if (!res.ok) return false;
      const found = res.items.find((c) => sameName(c.name, name));
      if (found) {
        await openRecipe(found);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const createCocktail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMutate) {
      setMsg("Solo un administrador puede crear cocteles.");
      return;
    }
    if (!newName.trim()) {
      setMsg("Escribe un nombre para el cóctel.");
      return;
    }
    setCreating(true);
    setMsg("");
    setOkMsg("");

    try {
      const payload: ProductPayload = {
        name: newName.trim(),
        category: newCategory.trim() || "Cocteles",
        price: Number(newPrice || "0") || 0,
        min_stock: Number(newMinStock || "0") || 0,
        kind: "COCKTAIL",
      };
      lastCreatedName.current = payload.name;

      const res = await safeProductsCreate(payload);
      if (!res.ok || !res.item) {
        setMsg(res.error || "No fue posible crear el cóctel");
        return;
      }

      flashOk("Cóctel creado");
      await openRecipe(res.item);
      await loadCocktails();
      closeCreate();
    } catch (e: any) {
      setMsg(String(e));
    } finally {
      setCreating(false);
    }
  };

  /* UI derivada */
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return cocktails
      .filter((p) => (p.is_active ?? 1) === 1)
      .filter(
        (p) =>
          !s ||
          p.name.toLowerCase().includes(s) ||
          (p.category || "").toLowerCase().includes(s)
      )
      .sort(
        (a, b) =>
          (a.category || "").localeCompare(b.category || "") ||
          a.name.localeCompare(b.name)
      );
  }, [cocktails, q]);

  /* Render */
  return (
    <div style={shell}>
      <div style={main}>
        <div style={container}>
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
                <h1 style={h1}>RECETAS</h1>
                <p style={subtitle}>
                  Crear, listar y editar recetas. Ingredientes:{" "}
                  <b>Bebidas base</b> y <b>Acompañamientos</b>.
                </p>
              </div>
            </div>
            {canMutate && (
              <button className="fx-btn" style={btnPrimary} onClick={openCreate}>
                Nuevo cóctel
              </button>
            )}
          </header>

          <div
            className="fx-card"
            style={{ ...card, padding: 12, marginBottom: 12 }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(220px,1fr) 160px auto",
                gap: 10,
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
                    if (e.key === "Enter") loadCocktails();
                  }}
                />
              </div>
              <div />
              <button className="fx-btn" style={btn} onClick={loadCocktails}>
                Buscar
              </button>
            </div>
          </div>

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

          <div className="fx-card" style={card}>
            <div
              style={{
                ...sectionTitle,
                borderBottom: "1px solid #eef0f4",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ color: `rgba(${YRGB},1)` }}>
                <ITag />
              </span>
              <span style={{ fontWeight: 800 }}>
                Listado de recetas (cócteles)
              </span>
            </div>

            <div style={tableHead}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 140px 120px 220px",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={th}>Cóctel</div>
                <div style={{ ...th, textAlign: "right" }}>Precio</div>
                <div style={{ ...th, textAlign: "center" }}>Estado</div>
                <div style={{ ...th, textAlign: "right" }}>Acciones</div>
              </div>
            </div>

            {loadingList ? (
              <div style={{ padding: 16 }}>Cargando…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 16 }}>Sin resultados</div>
            ) : (
              filtered.map((p, i) => (
                <div
                  key={String(p.id)}
                  className="fx-row"
                  style={{
                    ...rowBase,
                    display: "grid",
                    gridTemplateColumns: "1fr 140px 120px 220px",
                    gap: 10,
                    alignItems: "center",
                    animationDelay: `${i * 0.01}s`,
                  }}
                >
                  <div style={{ ...td }}>
                    {p.name}{" "}
                    {p.category ? (
                      <span style={{ color: MUTED }}>({p.category})</span>
                    ) : null}
                  </div>
                  <div style={{ ...td, textAlign: "right" }}>
                    {COP.format(p.price || 0)}
                  </div>
                  <div style={{ ...td, textAlign: "center" }}>
                    {(p.is_active ?? 1) === 1 ? "Activo" : "Inactivo"}
                  </div>
                  <div
                    style={{
                      ...td,
                      display: "flex",
                      gap: 8,
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      className="fx-btn"
                      style={btn}
                      onClick={() => openRecipe(p)}
                    >
                      Receta
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Modal receta */}
          {recipeModalOpen && recipeTarget && (
            <div
              className="fx-backdrop"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,.35)",
                display: "grid",
                placeItems: "center",
                zIndex: 60,
              }}
              onClick={closeRecipe}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="fx-modal"
                style={{
                  ...card,
                  width: "min(820px, 96vw)",
                  padding: 16,
                  maxHeight: "90vh",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ marginBottom: 8 }}>
                  <h3 style={{ margin: "0 0 8px" }}>
                    Receta: {recipeTarget?.name}
                  </h3>
                  <p style={{ margin: "0 0 4px", color: MUTED }}>
                    Ingredientes permitidos: <b>Bebidas base</b> y{" "}
                    <b>Acompañamientos</b>.
                  </p>
                </div>

                {recipeLoading ? (
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      overflowY: "auto",
                      padding: 10,
                    }}
                  >
                    Cargando receta…
                  </div>
                ) : recipeLines && recipeLines.length > 0 ? (
                  <>
                    <div
                      style={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: "auto",
                      }}
                    >
                      <div
                        className="fx-card"
                        style={{
                          border: "1px solid #eef0f4",
                          borderRadius: 12,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            ...tableHead,
                            display: "grid",
                            gridTemplateColumns:
                              "1fr 110px 140px 180px 84px",
                            gap: 10,
                            alignItems: "center",
                          }}
                        >
                          <div style={th}>Ingrediente</div>
                          <div style={{ ...th, textAlign: "right" }}>
                            Cantidad
                          </div>
                          <div style={th}>Unidad</div>
                          <div style={th}>Tipo</div>
                          <div />
                        </div>

                        {recipeLines.map((l, idx) => {
                          const opts =
                            l.role === "BASE" ? baseOptions : accompOptions;
                          return (
                            <div
                              key={`rl-${idx}`}
                              className="fx-row"
                              style={{
                                ...rowBase,
                                display: "grid",
                                gridTemplateColumns:
                                  "1fr 110px 140px 180px 84px",
                                gap: 10,
                                alignItems: "center",
                              }}
                            >
                              <select
                                className="fx-input"
                                style={input}
                                value={String(l.ingredient_id || "")}
                                onChange={(e) =>
                                  onSelectIngredient(
                                    idx,
                                    e.currentTarget.value
                                  )
                                }
                              >
                                <option value="">Selecciona…</option>
                                {opts
                                  .concat([])
                                  .sort((a, b) =>
                                    a.name.localeCompare(b.name)
                                  )
                                  .map((pp: Product) => (
                                    <option
                                      key={String(pp.id)}
                                      value={String(pp.id)}
                                    >
                                      {pp.name}
                                    </option>
                                  ))}
                              </select>

                              <input
                                className="fx-input"
                                style={{ ...inputSm, textAlign: "right" }}
                                inputMode="decimal"
                                value={l.qty}
                                onChange={(e) =>
                                  updRecipeLine(idx, {
                                    qty: e.currentTarget.value
                                      .replace(/[^\d.,-]/g, "")
                                      .replace(",", "."),
                                  })
                                }
                                placeholder="0"
                              />

                              <select
                                className="fx-input"
                                style={inputSm}
                                value={l.unit}
                                onChange={(e) =>
                                  updRecipeLine(idx, {
                                    unit: e.currentTarget.value.toUpperCase(),
                                  })
                                }
                              >
                                {(() => {
                                  const prod = opts.find(
                                    (o) =>
                                      String(o.id) ===
                                      String(l.ingredient_id || "")
                                  );
                                  const units = unitOptionsFor(prod);
                                  return (
                                    <>
                                      <option value="">
                                        {l.ingredient_id ? "Elige…" : "—"}
                                      </option>
                                      {units.map((u) => (
                                        <option key={u} value={u}>
                                          {u}
                                        </option>
                                      ))}
                                    </>
                                  );
                                })()}
                              </select>

                              <select
                                className="fx-input"
                                style={inputSm}
                                value={l.role}
                                onChange={(e) =>
                                  onChangeRole(
                                    idx,
                                    e.currentTarget
                                      .value as "BASE" | "ACCOMP"
                                  )
                                }
                              >
                                <option value="BASE">Bebida base</option>
                                <option value="ACCOMP">
                                  Acompañamiento
                                </option>
                              </select>

                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "flex-end",
                                }}
                              >
                                <button
                                  type="button"
                                  className="fx-btn"
                                  style={btn}
                                  onClick={() => rmRecipeLine(idx)}
                                >
                                  Eliminar
                                </button>
                              </div>

                              <div style={{ gridColumn: "1/-1" }}>
                                <input
                                  className="fx-input"
                                  style={{ ...input, height: 34 }}
                                  value={l.note}
                                  onChange={(e) =>
                                    updRecipeLine(idx, {
                                      note: e.currentTarget.value,
                                    })
                                  }
                                  placeholder="Nota (opcional)"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        className="fx-btn"
                        style={btnSoft}
                        onClick={addRecipeLine}
                      >
                        Añadir ingrediente
                      </button>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          className="fx-btn"
                          style={btn}
                          onClick={closeRecipe}
                        >
                          Cancelar
                        </button>
                        <button
                          className="fx-btn"
                          style={btnPrimary}
                          onClick={saveRecipe}
                          disabled={savingRecipe}
                        >
                          {savingRecipe ? "Guardando…" : "Guardar receta"}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      overflowY: "auto",
                    }}
                  >
                    <div
                      style={{
                        border: "1px dashed #e5e7eb",
                        borderRadius: 12,
                        padding: 16,
                        textAlign: "center",
                      }}
                    >
                      <p style={{ margin: "8px 0", color: MUTED }}>
                        Aún no has añadido ingredientes.
                      </p>
                      <button
                        className="fx-btn"
                        style={btnSoft}
                        onClick={addRecipeLine}
                      >
                        Añadir primer ingrediente
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Modal crear cóctel */}
          {createOpen && (
            <div
              className="fx-backdrop"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,.35)",
                display: "grid",
                placeItems: "center",
                zIndex: 65,
              }}
              onClick={closeCreate}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="fx-modal"
                style={{ ...card, width: "min(560px, 92vw)", padding: 16 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ margin: "0 0 8px" }}>Nuevo cóctel</h3>
                <form
                  onSubmit={createCocktail}
                  style={{ display: "grid", gap: 10 }}
                >
                  <input
                    className="fx-input"
                    style={input}
                    value={newName}
                    onChange={(e) => setNewName(e.currentTarget.value)}
                    placeholder="Nombre"
                    autoFocus
                  />
                  <input
                    className="fx-input"
                    style={input}
                    value={newCategory}
                    onChange={(e) =>
                      setNewCategory(e.currentTarget.value)
                    }
                    placeholder="Categoría (opcional)"
                  />
                  <input
                    className="fx-input"
                    style={input}
                    value={newPrice}
                    onChange={(e) =>
                      setNewPrice(
                        e.currentTarget.value.replace(/[^\d]/g, "")
                      )
                    }
                    inputMode="numeric"
                    placeholder="Precio (COP)"
                  />
                  <input
                    className="fx-input"
                    style={input}
                    value={newMinStock}
                    onChange={(e) =>
                      setNewMinStock(
                        e.currentTarget.value.replace(/[^\d]/g, "")
                      )
                    }
                    inputMode="numeric"
                    placeholder="Stock mínimo (opcional)"
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
                      onClick={async () => {
                        if (lastCreatedName.current) {
                          const ok = await tryOpenByName(
                            lastCreatedName.current
                          );
                          if (!ok)
                            setMsg(
                              "No encuentro el cóctel para abrir su receta todavía. Verifícalo en el listado."
                            );
                        }
                      }}
                    >
                      Abrir receta
                    </button>
                    <button
                      type="submit"
                      className="fx-btn"
                      style={btnPrimary}
                      disabled={creating}
                    >
                      {creating
                        ? "Creando…"
                        : "Crear y abrir receta"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        :root { --yr:${YRGB}; }
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(.98) translateY(6px) } to { opacity: 1; transform: none } }
        @keyframes backdropIn { from { opacity: 0 } to { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) {
          .fx-card, .fx-row, .fx-modal, .fx-backdrop { animation: none !important; }
          .fx-btn, .fx-chip, .fx-input { transition: none !important; }
        }
        .fx-card { animation: fadeSlideUp .45s cubic-bezier(.2,.65,.2,1) both; }
        .fx-row  { animation: fadeSlideUp .35s ease both; }
        .fx-modal { animation: scaleIn .26s ease both; }
        .fx-backdrop { animation: backdropIn .18s ease both; }
        .fx-btn { transition: transform .1s ease, box-shadow .2s ease, background .2s ease, border-color .2s ease; }
        .fx-btn:active { transform: translateY(1px) scale(.98); }
        .fx-input:focus {
          border-color: rgba(${YRGB}, .65) !important;
          box-shadow: 0 0 0 3px rgba(${YRGB}, .22);
        }
        .fx-row:hover { background: rgba(0,0,0,.02); }
      `}</style>
    </div>
  );
}
