import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

/* ===== Tipos ===== */
type Role = "admin" | "vendedor";

type Me = { id: number; username: string; name: string; role: Role } | null;

type User = {
  id: string | number;
  username: string;
  name: string;
  role: Role;
  active?: boolean;
};

type ApiUser = {
  id?: string | number;
  _id?: string | number;
  username: string;
  name: string;
  role: Role;
  isActive?: boolean;
};

type ApiResp<T = any> = { ok: boolean; error?: string } & T;

/* ===== Config API / Auth (igual ProductsPage) ===== */
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

/* ===== Helpers API ===== */
async function safeAuthMe(): Promise<ApiResp<{ user: Me }>> {
  return httpJSON("GET", "/api/auth/me", undefined, { auth: true });
}

function normalizeUser(raw: ApiUser): User {
  return {
    id: raw.id ?? raw._id ?? "",
    username: raw.username,
    name: raw.name,
    role: raw.role,
    active: raw.isActive ?? true,
  };
}

async function safeUsersList(): Promise<{
  ok: boolean;
  items: User[];
  error?: string;
}> {
  const res = await httpJSON<{ users?: ApiUser[] }>(
    "GET",
    "/api/users",
    undefined,
    {
      auth: true,
    }
  );
  if (!res.ok) {
    return {
      ok: false,
      items: [],
      error: res.error || "No se pudo cargar la lista de usuarios",
    };
  }
  const items = (res.users || []).map(normalizeUser);
  return { ok: true, items };
}

async function safeUsersCreate(payload: {
  username: string;
  name: string;
  role: Role;
  pin: string;
}): Promise<{ ok: boolean; item?: User; error?: string }> {
  const res = await httpJSON<{ user?: ApiUser }>(
    "POST",
    "/api/users",
    payload,
    {
      auth: true,
    }
  );
  if (!res.ok) {
    return { ok: false, error: res.error || "No fue posible crear el usuario" };
  }
  return { ok: true, item: res.user ? normalizeUser(res.user) : undefined };
}

async function safeUsersUpdate(
  id: string | number,
  payload: any
): Promise<{ ok: boolean; item?: User; error?: string }> {
  const res = await httpJSON<{ user?: ApiUser }>(
    "PUT",
    `/api/users/${id}`,
    payload,
    {
      auth: true,
    }
  );
  if (!res.ok) {
    return {
      ok: false,
      error: res.error || "No fue posible actualizar el usuario",
    };
  }
  return { ok: true, item: res.user ? normalizeUser(res.user) : undefined };
}

async function safeUsersDelete(
  id: string | number
): Promise<{ ok: boolean; error?: string }> {
  const res = await httpJSON("DELETE", `/api/users/${id}`, undefined, {
    auth: true,
  });
  if (!res.ok) {
    return {
      ok: false,
      error: res.error || "No fue posible eliminar el usuario",
    };
  }
  return { ok: true };
}

/* ===== Icono ===== */
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

/* ===== Estilos (igual inventario) ===== */
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
  transition: "transform .16s ease, box-shadow .16s ease",
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

const inputBase: React.CSSProperties = {
  width: "100%",
  height: 36,
  padding: "8px 10px",
  borderRadius: 10,
  background: "#fff",
  border: "1px solid #e5e7eb",
  outline: "none",
  minWidth: 0,
  boxSizing: "border-box",
  transition: "border-color .18s ease, box-shadow .18s ease",
};
const input = inputBase;

const btn: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "#fff",
  cursor: "pointer",
  transition: "transform .16s ease, box-shadow .16s ease, opacity .2s",
};
const btnPrimary: React.CSSProperties = {
  ...btn,
  borderColor: `rgba(${YRGB},0.8)`,
  background: `linear-gradient(180deg, rgba(${YRGB},1), rgba(${YRGB},0.92))`,
  color: "#2b2323",
  fontWeight: 700,
  boxShadow: `0 8px 18px rgba(${YRGB},0.28)`,
};
const btnWarn: React.CSSProperties = {
  ...btn,
  borderColor: "rgba(176,0,32,.35)",
  background: "rgba(176,0,32,.08)",
  color: "#b00020",
  fontWeight: 700,
};
const btnOk: React.CSSProperties = {
  ...btn,
  borderColor: "rgba(46,125,50,.35)",
  background: "rgba(46,125,50,.12)",
  color: "#2e7d32",
  fontWeight: 700,
};
const btnDanger: React.CSSProperties = {
  ...btn,
  borderColor: "rgba(176,0,32,.35)",
  background: "rgba(176,0,32,.08)",
  color: "#b00020",
  fontWeight: 700,
};

const roleBadge = (role: Role): React.CSSProperties => ({
  padding: "2px 8px",
  borderRadius: 999,
  border: `1px solid rgba(${YRGB},0.45)`,
  background: "rgba(244,194,43,.12)",
  color: "#5a4700",
  fontSize: 12,
  fontWeight: 700,
});

const panelTitle: React.CSSProperties = {
  margin: 0,
  marginBottom: 8,
  fontSize: 16,
  fontWeight: 800,
};
const rowGrid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
  alignItems: "start",
};
const formLabel: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  color: MUTED,
  fontWeight: 600,
};

const modalBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "grid",
  placeItems: "center",
  zIndex: 50,
};
const modalCard: React.CSSProperties = {
  width: "min(560px, 92vw)",
  borderRadius: RADIUS,
  background: "#fff",
  border: "1px solid #e5e7eb",
  boxShadow: "0 14px 44px rgba(0,0,0,0.10)",
  padding: 16,
};

/* ===== Badge de estado ===== */
function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className="u-pop"
      style={{
        padding: "3px 10px",
        borderRadius: 999,
        color: active ? "#2e7d32" : "#b00020",
        background: active ? "rgba(46,125,50,.12)" : "rgba(176,0,32,.10)",
        border: active
          ? "1px solid rgba(46,125,50,.35)"
          : "1px solid rgba(176,0,32,.28)",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {active ? "Activo" : "Bloqueado"}
    </span>
  );
}

/* ===== Página ===== */
export default function UsersPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me>(null);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [items, setItems] = useState<User[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [msg, setMsg] = useState("");

  // Crear usuario
  const [openCreate, setOpenCreate] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Role>("vendedor");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [creating, setCreating] = useState(false);

  // Reset PIN
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPin, setNewPin] = useState("");
  const [newPin2, setNewPin2] = useState("");
  const [resetting, setResetting] = useState(false);

  // Eliminar
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  /* Carga inicial: auth + lista, igual patrón de ProductsPage */
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
        await loadList();
      } catch (e: any) {
        setMsg(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const loadList = async () => {
    setLoadingList(true);
    setMsg("");
    try {
      const resp = await safeUsersList();
      if (resp.ok) {
        const list = resp.items;
        const s = q.trim().toLowerCase();
        if (!s) {
          setItems(list);
        } else {
          setItems(
            list.filter(
              (u) =>
                (u.name || "").toLowerCase().includes(s) ||
                (u.username || "").toLowerCase().includes(s) ||
                (u.role || "").toLowerCase().includes(s)
            )
          );
        }
      } else {
        setMsg(resp.error || "No se pudo cargar la lista de usuarios");
      }
    } catch (e: any) {
      setMsg(String(e));
    } finally {
      setLoadingList(false);
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(s) ||
        (u.username || "").toLowerCase().includes(s) ||
        (u.role || "").toLowerCase().includes(s)
    );
  }, [items, q]);

  const pinRegex = /^[0-9]{4,6}$/;

  const canCreate =
    name.trim().length > 0 &&
    username.trim().length > 0 &&
    pinRegex.test(pin) &&
    pin === pin2;

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    setCreating(true);
    setMsg("");
    try {
      const resp = await safeUsersCreate({
        username: username.trim(),
        name: name.trim(),
        role,
        pin,
      });
      if (resp.ok) {
        setName("");
        setUsername("");
        setRole("vendedor");
        setPin("");
        setPin2("");
        setOpenCreate(false);
        await loadList();
      } else {
        setMsg(resp.error || "No fue posible crear el usuario");
      }
    } catch (e: any) {
      setMsg(String(e));
    } finally {
      setCreating(false);
    }
  };

  // Bloquear / Desbloquear
  const toggleActive = async (u: User) => {
    const nextActive = !(u.active ?? true);
    const ok = window.confirm(
      nextActive
        ? `¿Reactivar a ${u.name}?`
        : `¿Bloquear a ${u.name}? No podrá iniciar sesión.`
    );
    if (!ok) return;
    try {
      const resp = await safeUsersUpdate(u.id, {
        isActive: nextActive,
      });
      if (resp.ok) {
        setItems((prev) =>
          prev.map((x) => (x.id === u.id ? { ...x, active: nextActive } : x))
        );
      } else {
        setMsg(resp.error || "No fue posible actualizar el estado");
      }
    } catch (e: any) {
      setMsg(String(e));
    }
  };

  // Reset PIN
  const resetPin = (u: User) => {
    setResetTarget(u);
    setNewPin("");
    setNewPin2("");
    setMsg("");
  };
  const closeReset = () => {
    setResetTarget(null);
    setNewPin("");
    setNewPin2("");
  };
  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    if (!pinRegex.test(newPin) || !pinRegex.test(newPin2)) {
      setMsg("El PIN debe ser de 4 a 6 dígitos numéricos");
      return;
    }
    if (newPin !== newPin2) {
      setMsg("Los PIN no coinciden");
      return;
    }
    if (!resetTarget) return;
    try {
      setResetting(true);
      const resp = await safeUsersUpdate(resetTarget.id, { pin: newPin });
      if (resp.ok) {
        closeReset();
        setMsg("PIN actualizado");
        setTimeout(() => setMsg(""), 2000);
      } else {
        setMsg(resp.error || "No fue posible actualizar el PIN");
      }
    } catch (e: any) {
      setMsg(String(e));
    } finally {
      setResetting(false);
    }
  };

  // Eliminar
  const openDelete = (u: User) => {
    setDeleteTarget(u);
    setConfirmText("");
    setMsg("");
  };
  const closeDelete = () => {
    setDeleteTarget(null);
    setConfirmText("");
  };
  const submitDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteTarget) return;
    if (confirmText.trim() !== deleteTarget.username) {
      setMsg("Escribe exactamente el nombre de usuario para confirmar.");
      return;
    }
    try {
      setDeleting(true);
      const resp = await safeUsersDelete(deleteTarget.id);
      if (resp.ok) {
        setItems((prev) => prev.filter((x) => x.id !== deleteTarget.id));
        closeDelete();
        setMsg("Usuario eliminado");
        setTimeout(() => setMsg(""), 2000);
      } else {
        setMsg(resp.error || "No fue posible eliminar el usuario");
      }
    } catch (e: any) {
      setMsg(String(e));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          background: BG,
          color: TEXT,
          display: "grid",
          placeItems: "center",
        }}
      >
        Cargando...
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={main}>
        <div style={container} className="a-fade">
          {/* Header */}
          <header style={header}>
            <div style={titleRow}>
              <button
                className="u-press"
                style={backBtn}
                onClick={() => navigate("/dashboard")}
                aria-label="Volver al dashboard"
              >
                <IHome />
              </button>
              <div>
                <h1 style={h1}>USUARIOS</h1>
                <p style={subtitle}>Gestiona cuentas y accesos</p>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <input
                placeholder="Buscar por nombre, usuario o rol…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") loadList();
                }}
                style={{ ...input, width: 260 }}
              />
              <button className="u-press" onClick={() => loadList()} style={btn}>
                Buscar
              </button>
              <button
                className="u-press"
                onClick={() => setOpenCreate((v) => !v)}
                style={btnPrimary}
              >
                {openCreate ? "Cerrar" : "Nuevo usuario"}
              </button>
            </div>
          </header>

          {/* Mensajes */}
          {msg && (
            <div
              className="card-pop"
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
                  className="u-press"
                  style={{
                    ...btn,
                    padding: "6px 10px",
                  }}
                  onClick={() => setMsg("")}
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {/* Panel crear */}
          {openCreate && (
            <div
              className="slide-down"
              style={{
                ...card,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <h3 style={panelTitle}>Crear usuario</h3>
              <form
                onSubmit={onCreate}
                style={{
                  display: "grid",
                  gap: 12,
                }}
              >
                <div style={rowGrid2}>
                  <div>
                    <label style={formLabel}>Nombre</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      style={input}
                    />
                  </div>
                  <div>
                    <label style={formLabel}>Usuario</label>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      style={input}
                    />
                  </div>
                </div>

                <div style={rowGrid2}>
                  <div>
                    <label style={formLabel}>Rol</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as Role)}
                      style={input}
                    >
                      <option value="vendedor">vendedor</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>

                  <div style={rowGrid2}>
                    <div>
                      <label style={formLabel}>PIN</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        minLength={4}
                        maxLength={6}
                        autoComplete="new-password"
                        title="4 a 6 dígitos"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        onInput={(e) => {
                          const t = e.target as HTMLInputElement;
                          t.value = t.value.replace(/\D/g, "");
                        }}
                        required
                        style={input}
                      />
                    </div>
                    <div>
                      <label style={formLabel}>Confirmar PIN</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        minLength={4}
                        maxLength={6}
                        autoComplete="new-password"
                        title="4 a 6 dígitos"
                        value={pin2}
                        onChange={(e) => setPin2(e.target.value)}
                        onInput={(e) => {
                          const t = e.target as HTMLInputElement;
                          t.value = t.value.replace(/\D/g, "");
                        }}
                        required
                        style={input}
                      />
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "flex-end",
                    marginTop: 4,
                  }}
                >
                  <button
                    className="u-press"
                    type="button"
                    onClick={() => setOpenCreate(false)}
                    style={btn}
                  >
                    Cancelar
                  </button>
                  <button
                    className="u-press"
                    type="submit"
                    style={{
                      ...btnPrimary,
                      opacity: canCreate && !creating ? 1 : 0.7,
                    }}
                    disabled={!canCreate || creating}
                  >
                    {creating ? "Creando..." : "Crear"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tabla */}
          <div className="card-pop" style={card}>
            <div
              style={{
                ...sectionTitle,
                borderBottom: "1px solid #eef0f4",
              }}
            >
              Listado
            </div>

            {/* Head */}
            <div style={tableHead}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1.5fr 120px 120px 320px",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div style={th}>Nombre</div>
                <div style={th}>Usuario</div>
                <div
                  style={{
                    ...th,
                    textAlign: "center",
                  }}
                >
                  Rol
                </div>
                <div
                  style={{
                    ...th,
                    textAlign: "center",
                  }}
                >
                  Estado
                </div>
                <div
                  style={{
                    ...th,
                    textAlign: "right",
                  }}
                >
                  Acciones
                </div>
              </div>
            </div>

            {/* Rows */}
            {loadingList ? (
              <div style={rowBase}>Cargando usuarios…</div>
            ) : filtered.length === 0 ? (
              <div style={rowBase}>No hay resultados</div>
            ) : (
              filtered.map((u, i) => (
                <div
                  key={u.id}
                  className="row-appear"
                  style={{
                    ...rowBase,
                    animationDelay: `${Math.min(i, 12) * 30}ms`,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1.5fr 120px 120px 320px",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div style={td}>{u.name}</div>
                    <div style={td}>{u.username}</div>
                    <div
                      style={{
                        ...td,
                        textAlign: "center",
                      }}
                    >
                      <span className="u-pop" style={roleBadge(u.role)}>
                        {u.role}
                      </span>
                    </div>
                    <div
                      style={{
                        ...td,
                        textAlign: "center",
                      }}
                    >
                      <StatusBadge active={u.active ?? true} />
                    </div>
                    <div
                      style={{
                        ...td,
                        display: "flex",
                        gap: 8,
                        justifyContent: "flex-end",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        className="u-press"
                        style={btn}
                        onClick={() => resetPin(u)}
                        title="Resetear PIN"
                      >
                        Reset PIN
                      </button>
                      <button
                        className="u-press"
                        style={(u.active ?? true) ? btnWarn : btnOk}
                        onClick={() => toggleActive(u)}
                        title={(u.active ?? true) ? "Bloquear" : "Reactivar"}
                      >
                        {u.active ?? true ? "Bloquear" : "Reactivar"}
                      </button>
                      <button
                        className="u-press"
                        style={btnDanger}
                        onClick={() => openDelete(u)}
                        title="Eliminar usuario"
                        disabled={me != null && u.id === me.id}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Modal Reset PIN */}
          {resetTarget && (
            <div
              className="backdrop-fade"
              style={modalBackdrop}
              onClick={closeReset}
            >
              <div
                className="modal-pop"
                style={modalCard}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={panelTitle}>Resetear PIN</h3>
                <p
                  style={{
                    marginTop: 2,
                    marginBottom: 10,
                    color: MUTED,
                  }}
                >
                  Usuario: <b>{resetTarget.name}</b> ({resetTarget.username})
                </p>

                <form
                  onSubmit={submitReset}
                  style={{
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div style={rowGrid2}>
                    <div>
                      <label style={formLabel}>Nuevo PIN</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        minLength={4}
                        maxLength={6}
                        autoComplete="new-password"
                        title="4 a 6 dígitos"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        onInput={(e) => {
                          const t = e.target as HTMLInputElement;
                          t.value = t.value.replace(/\D/g, "");
                        }}
                        required
                        style={input}
                      />
                    </div>
                    <div>
                      <label style={formLabel}>Confirmar PIN</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        minLength={4}
                        maxLength={6}
                        autoComplete="new-password"
                        title="4 a 6 dígitos"
                        value={newPin2}
                        onChange={(e) => setNewPin2(e.target.value)}
                        onInput={(e) => {
                          const t = e.target as HTMLInputElement;
                          t.value = t.value.replace(/\D/g, "");
                        }}
                        required
                        style={input}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      className="u-press"
                      type="button"
                      onClick={closeReset}
                      style={btn}
                    >
                      Cancelar
                    </button>
                    <button
                      className="u-press"
                      type="submit"
                      style={{
                        ...btnPrimary,
                        opacity: resetting ? 0.7 : 1,
                      }}
                      disabled={resetting}
                    >
                      {resetting ? "Guardando..." : "Guardar PIN"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal Eliminar */}
          {deleteTarget && (
            <div
              className="backdrop-fade"
              style={modalBackdrop}
              onClick={closeDelete}
            >
              <div
                className="modal-pop"
                style={modalCard}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={panelTitle}>Eliminar usuario</h3>
                <p
                  style={{
                    marginTop: 2,
                    marginBottom: 10,
                    color: MUTED,
                  }}
                >
                  Vas a eliminar a <b>{deleteTarget.name}</b>{" "}
                  (<code>{deleteTarget.username}</code>). Esta acción es permanente.
                </p>

                <form
                  onSubmit={submitDelete}
                  style={{
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div>
                    <label style={formLabel}>
                      Escribe el nombre de usuario <b>{deleteTarget.username}</b>{" "}
                      para confirmar
                    </label>
                    <input
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      autoFocus
                      style={input}
                    />
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      className="u-press"
                      type="button"
                      onClick={closeDelete}
                      style={btn}
                    >
                      Cancelar
                    </button>
                    <button
                      className="u-press"
                      type="submit"
                      style={{
                        ...btnDanger,
                        opacity: deleting ? 0.7 : 1,
                      }}
                      disabled={deleting}
                    >
                      {deleting ? "Eliminando..." : "Eliminar"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* CSS local de animaciones */}
          <style>{localCss}</style>
        </div>
      </div>
    </div>
  );
}

/* ===== CSS in-JS (animaciones y focus) ===== */
const localCss = `
  .u-press { will-change: transform; }
  .u-press:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,.06); }
  .u-press:active { transform: translateY(0); box-shadow: 0 3px 8px rgba(0,0,0,.05); }

  .a-fade { animation: fade-in .22s ease-out both; }
  .card-pop { animation: pop .22s ease-out both; }
  .row-appear { animation: fade-up .28s cubic-bezier(.22,.8,.24,.99) both; }
  .slide-down { animation: slide-down .26s cubic-bezier(.22,.8,.24,.99) both; }

  .backdrop-fade { animation: fade-in .18s ease-out both; }
  .modal-pop { animation: pop .22s ease-out both; }
  .u-pop { animation: soft-pop .22s ease-out both; }

  @keyframes fade-in { from{opacity:0} to{opacity:1} }
  @keyframes fade-up { from{opacity:0; transform: translateY(6px)} to{opacity:1; transform: translateY(0)} }
  @keyframes slide-down { from{opacity:.0; transform: translateY(-6px)} to{opacity:1; transform: translateY(0)} }
  @keyframes pop { from{opacity:0; transform: scale(.98)} to{opacity:1; transform: scale(1)} }
  @keyframes soft-pop { from{transform: scale(.98)} to{transform: scale(1)} }

  input, select, textarea {
    transition: box-shadow .18s ease, border-color .18s ease;
  }
  input:focus, select:focus, textarea:focus {
    border-color: rgba(${YRGB}, .6);
    box-shadow: 0 0 0 3px rgba(${YRGB}, .18);
  }

  @media (prefers-reduced-motion: reduce) {
    .a-fade, .card-pop, .row-appear, .slide-down, .backdrop-fade, .modal-pop, .u-pop {
      animation: none !important;
    }
    .u-press { transition: none !important; }
  }
`;
