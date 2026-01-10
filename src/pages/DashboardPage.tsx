import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

/* Tipos base */
type Role = "admin" | "vendedor";
type User = { id: number; username: string; name: string; role: Role } | null;
type ApiResp<T = any> = { ok: boolean; error?: string } & T;

/* Config API / Auth */
const API_BASE = (process.env.REACT_APP_API_URL || "").replace(/\/+$/, "");

/* Lee token desde localStorage */
function getToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("authToken") || "";
}

/* Guarda o limpia token */
function setToken(token?: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem("authToken", token);
  else window.localStorage.removeItem("authToken");
}

/* Helper base para peticiones JSON */
async function httpJSON<T = any>(
  method: "GET" | "POST",
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
          120
        )}`,
      } as ApiResp<T>;
    }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) } as ApiResp<T>;
  }
}

/* Helper auth */
async function safeAuthMe(): Promise<ApiResp<{ user: User }>> {
  return httpJSON("GET", "/api/auth/me", undefined, { auth: true });
}

/* Iconos base */
const baseIconProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

/* Icono de marca para el título */
const IconBrand = () => (
  <svg {...baseIconProps} width={26} height={26}>
    <rect x="3" y="4" width="18" height="15" rx="4" />
    <path d="M7 9h10" />
    <path d="M7 13h5" />
  </svg>
);

const IconTabs = () => (
  <svg {...baseIconProps}>
    <rect x="3" y="4" width="8" height="7" rx="1" />
    <rect x="13" y="4" width="8" height="7" rx="1" />
    <rect x="3" y="13" width="8" height="7" rx="1" />
    <rect x="13" y="13" width="8" height="7" rx="1" />
  </svg>
);

const IconVentas = () => (
  <svg {...baseIconProps}>
    <path d="M4 7h16l-1.5 9H5.5L4 7Z" />
    <circle cx="9" cy="19" r="1.5" />
    <circle cx="17" cy="19" r="1.5" />
    <path d="M4 7 3 4H1.5" />
  </svg>
);

const IconInventario = () => (
  <svg {...baseIconProps}>
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <path d="M3 10h18" />
    <path d="M9 14h6" />
  </svg>
);

const IconReportes = () => (
  <svg {...baseIconProps}>
    <path d="M4 20V5a2 2 0 0 1 2-2h8l6 6v11" />
    <path d="M14 3v5h5" />
    <path d="M8 14l2.5-2.5L13 14l3-4 3 4" />
  </svg>
);

const IconUsuarios = () => (
  <svg {...baseIconProps}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
    <circle cx="10" cy="8" r="3" />
    <path d="M20 21v-2a3 3 0 0 0-2-2.82" />
    <path d="M18 4.2a3 3 0 0 1 0 5.6" />
  </svg>
);

const IconProductos = () => (
  <svg {...baseIconProps}>
    <path d="M3 7L12 3l9 4-9 4-9-4Z" />
    <path d="M3 7v10l9 4 9-4V7" />
    <path d="M12 11v10" />
  </svg>
);

const IconLista = () => (
  <svg {...baseIconProps}>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <circle cx="4" cy="6" r="1.5" />
    <circle cx="4" cy="12" r="1.5" />
    <circle cx="4" cy="18" r="1.5" />
  </svg>
);

const IconRecetas = () => (
  <svg {...baseIconProps}>
    <rect x="4" y="3" width="14" height="18" rx="2" />
    <path d="M8 7h6" />
    <path d="M8 11h6" />
    <path d="M8 15h3" />
  </svg>
);

const IconGastos = () => (
  <svg {...baseIconProps}>
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="M4 12H2" />
    <path d="M22 12h-2" />
    <path d="M7.5 7.5 6 6" />
    <path d="M18 18l-1.5-1.5" />
    <path d="M16.5 7.5 18 6" />
    <path d="M6 18l1.5-1.5" />
    <circle cx="12" cy="12" r="5" />
    <path d="M12 9v6" />
    <path d="M9.5 12h5" />
  </svg>
);

const IconLogout = () => (
  <svg {...baseIconProps}>
    <path d="M15 3h-4a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h4" />
    <path d="M10 12h10" />
    <path d="m17 9 3 3-3 3" />
  </svg>
);

/* Tokens de estilo */
const YRGB = "244,194,43";
const BG = "#f7f8fb";
const TEXT = "#222831";
const MUTED = "#6b7280";

/* Layout base */
const shell: React.CSSProperties = {
  minHeight: "100vh",
  background: BG,
  color: TEXT,
  display: "flex",
};

const main: React.CSSProperties = {
  flex: 1,
  display: "grid",
  gridTemplateRows: "auto 1fr",
  padding: "clamp(12px, 4vw, 24px)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
};

/* Bloque de marca con icono + textos */
const brandBlock: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const brandTextBlock: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const brandTitle: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(18px, 3.4vw, 22px)",
  fontWeight: 800,
};

const brandSub: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(11px, 2.4vw, 13px)",
  color: MUTED,
};

const userBlock: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const userInfoWrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const userText: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
  textAlign: "right",
};

const userNameStyle: React.CSSProperties = {
  fontSize: "clamp(13px, 2.6vw, 15px)",
  fontWeight: 700,
};

const userRoleStyle: React.CSSProperties = {
  fontSize: "clamp(11px, 2.3vw, 13px)",
  color: MUTED,
};

const btnExit: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  padding: "8px 12px",
  borderRadius: 10,
  border: `1px solid rgba(${YRGB},0.6)`,
  background: "linear-gradient(180deg, #ffffff, rgba(255,255,255,0.9))",
  cursor: "pointer",
  fontSize: "clamp(11px, 2.3vw, 13px)",
  fontWeight: 600,
  color: TEXT,
  transition:
    "transform 160ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease",
};

/* Contenedor de secciones y grid compartido */
const sectionsContainer: React.CSSProperties = {
  width: "100%",
  maxWidth: 1100,
  margin: "0 auto",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gap: 18,
  width: "100%",
  margin: 0,
  marginTop: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  justifyItems: "stretch",
  alignItems: "stretch",
};

const cardStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  borderRadius: 16,
  border: `1px solid rgba(${YRGB},0.4)`,
  background: "linear-gradient(180deg, #ffffff, rgba(255,255,255,0.86))",
  boxShadow: "0 12px 30px rgba(15,23,42,0.06)",
  overflow: "hidden",
};

const cardInnerStyle: React.CSSProperties = {
  position: "relative",
  padding: "14px 14px 16px",
  display: "grid",
  gap: 6,
};

const iconWrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  marginBottom: 4,
  color: TEXT,
  opacity: 0.95,
};

const chipSoft: React.CSSProperties = {
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  border: `1px solid rgba(${YRGB},0.45)`,
  background: `linear-gradient(180deg, rgba(${YRGB},0.16), rgba(${YRGB},0.10))`,
  color: "#3a3200",
};

const cardTitle: React.CSSProperties = {
  fontSize: "clamp(14px, 2.6vw, 16px)",
  fontWeight: 700,
  textAlign: "center",
};

const cardDesc: React.CSSProperties = {
  fontSize: "clamp(12px, 2.4vw, 14px)",
  color: MUTED,
  textAlign: "center",
};

const h2Style: React.CSSProperties = {
  margin: "18px 0 4px",
  fontSize: "clamp(15px, 2.4vw, 18px)",
  fontWeight: 800,
  color: "#111827",
};

/* Tipos de items */
type Item = {
  key: string;
  title: string;
  desc: string;
  Icon: React.FC;
  to?: string;
  onClick?: () => void;
};

/* Sección reutilizable */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 style={h2Style}>{title}</h2>
      {children}
    </section>
  );
}

/* Grid de tarjetas */
function CardGrid({ items, badge }: { items: Item[]; badge?: string }) {
  const navigate = useNavigate();

  const perCardStyle: React.CSSProperties = {
    ...cardStyle,
    minHeight: 150,
  };

  return (
    <div style={gridStyle} className="card-grid">
      {items.map((it, i) => {
        const body = (
          <div className="card-inner" style={cardInnerStyle}>
            <div style={iconWrap}>
              <it.Icon />
              {badge && <span style={chipSoft}>{badge}</span>}
            </div>
            <div style={cardTitle} className="card-title">
              {it.title}
            </div>
            <div style={cardDesc} className="card-desc">
              {it.desc}
            </div>
          </div>
        );

        const handleClick = () => {
          if (it.onClick) {
            it.onClick();
          } else if (it.to) {
            navigate(it.to);
          }
        };

        const animStyle: React.CSSProperties = {
          animation: `cardIn 260ms ease ${(i * 40) / 1000}s both`,
        };

        return (
          <button
            key={it.key}
            type="button"
            style={{ ...perCardStyle, ...animStyle }}
            className="card card-link"
            onClick={handleClick}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

/* Avatar para usuario */
function initials(s: string) {
  const parts = s.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const avatar = (_seed: string): React.CSSProperties => ({
  width: 36,
  height: 36,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: `linear-gradient(180deg, rgba(${YRGB},0.16), rgba(${YRGB},0.10))`,
  border: `1px solid rgba(${YRGB},0.55)`,
  color: "#3b3b3b",
  fontWeight: 800,
});

/* Componente principal */
export default function DashboardPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  /* Ajuste de viewport para móvil */
  useEffect(() => {
    const desired = "width=device-width, initial-scale=1, viewport-fit=cover";
    let tag = document.querySelector(
      'meta[name="viewport"]'
    ) as HTMLMetaElement | null;
    if (!tag) {
      tag = document.createElement("meta");
      tag.name = "viewport";
      document.head.appendChild(tag);
    }
    if (tag.content !== desired) tag.content = desired;
  }, []);

  /* Cargar usuario actual o redirigir al login */
  useEffect(() => {
    (async () => {
      try {
        const token = getToken();
        if (!token) {
          navigate("/login", { replace: true });
          return;
        }
        const cur = await safeAuthMe();
        if (!cur?.ok || !cur.user) {
          setToken(null);
          navigate("/login", { replace: true });
          return;
        }
        setMe(cur.user);
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  /* Salir de la sesión */
  const salir = () => {
    const btnEl = document.querySelector(".btn-exit");
    btnEl?.classList.add("exit-press");
    setTimeout(() => {
      setToken(null);
      navigate("/login", { replace: true });
    }, 160);
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
          fontSize: "clamp(14px, 3vw, 16px)",
        }}
      >
        Cargando...
      </div>
    );
  }

  if (!me) {
    return null;
  }

  /* Definir grupos de módulos */
  const ventas: Item[] = [
    {
      key: "tabs",
      title: "Mesas / Tabs",
      desc: "Abrir, mover y cerrar cuentas por mesa o barra.",
      to: "/tabs",
      Icon: IconTabs,
    },
    {
      key: "ventas-rapidas",
      title: "Ventas rápidas",
      desc: "Venta directa desde catálogo y cierre rápido.",
      to: "/ventas",
      Icon: IconVentas,
    },
    {
      key: "ventas-lista",
      title: "Listado de ventas",
      desc: "Historial de ventas con filtros y detalle.",
      to: "/ventas/lista",
      Icon: IconLista,
    },
    {
      key: "ventas-reportes",
      title: "Reportes de ventas",
      desc: "Totales, formas de pago y resúmenes.",
      to: "/ventas/reportes",
      Icon: IconReportes,
    },
    {
      key: "gastos",
      title: "Gastos",
      desc: "Registrar y consultar gastos manuales.",
      to: "/gastos",
      Icon: IconGastos,
    },
  ];

  const operacion: Item[] = [
    {
      key: "inventario",
      title: "Inventario",
      desc: "Movimientos, stock disponible y alertas.",
      to: "/inventario",
      Icon: IconInventario,
    },
    {
      key: "productos",
      title: "Productos",
      desc: "Catálogo, categorías y precios.",
      to: "/productos",
      Icon: IconProductos,
    },
    {
      key: "recetas",
      title: "Recetas",
      desc: "Bases, acompañantes y cócteles.",
      to: "/recetas",
      Icon: IconRecetas,
    },
  ];

  const admin: Item[] =
    me.role === "admin"
      ? [
          {
            key: "usuarios",
            title: "Usuarios",
            desc: "Crear usuarios y configurar permisos.",
            to: "/usuarios",
            Icon: IconUsuarios,
          },
        ]
      : [];

  return (
    <div style={shell} className="dash-root">
      <div style={main}>
        <header style={headerRow}>
          <div style={brandBlock}>
            <IconBrand />
            <div style={brandTextBlock}>
              <h1 style={brandTitle}>Bar POS Online</h1>
              <p style={brandSub}>Panel principal de módulos</p>
            </div>
          </div>

          <div style={userBlock}>
            <div style={userInfoWrap}>
              <div style={avatar(me.name || me.username)}>
                {initials(me.name || me.username)}
              </div>
              <div style={userText}>
                <span style={userNameStyle}>{me.name}</span>
                <span style={userRoleStyle}>
                  {me.role === "admin" ? "Administrador" : "Vendedor"}
                </span>
              </div>
            </div>

            <button
              type="button"
              style={btnExit}
              className="btn-exit"
              onClick={salir}
            >
              <IconLogout />
              <span>Salir</span>
            </button>
          </div>
        </header>

        <div style={sectionsContainer}>
          <Section title="Ventas">
            <CardGrid items={ventas} />
          </Section>

          <Section title="Operación diaria">
            <CardGrid items={operacion} />
          </Section>

          {admin.length > 0 && (
            <Section title="Administración">
              <CardGrid items={admin} badge="Admin" />
            </Section>
          )}
        </div>

        <style>{localCss}</style>
      </div>
    </div>
  );
}

/* CSS embebido */
const localCss = `
  html, body { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }

  .dash-root {
    --card-shadow: 0 12px 30px rgba(0,0,0,0.04), inset 0 -1px 0 rgba(${YRGB},0.10);
    animation: pageIn 260ms ease both;
  }

  @keyframes pageIn {
    from { opacity: 0; transform: translateY(6px) scale(0.99); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes cardIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .card-grid .card {
    will-change: transform, box-shadow;
  }

  @media (max-width: 640px) {
    .card-grid {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dash-root, .card, .card-inner, .btn-exit {
      animation: none !important;
      transition: none !important;
    }
  }

  .btn-exit:hover {
    transform: translateY(-1px);
    border-color: rgba(${YRGB},0.7);
    box-shadow: 0 10px 20px rgba(${YRGB},0.12), inset 0 -1px 0 rgba(${YRGB},0.22);
    background: linear-gradient(180deg, #ffffff, rgba(255,255,255,0.9));
  }

  .btn-exit:active,
  .btn-exit.exit-press {
    transform: translateY(0) scale(0.98);
    border-color: rgba(${YRGB},0.9);
    box-shadow: 0 6px 12px rgba(${YRGB},0.10), inset 0 -1px 0 rgba(${YRGB},0.28);
  }
`;
