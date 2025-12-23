import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

/* Tipos */
type User = {
  id: number;
  username: string;
  name: string;
  role: "admin" | "vendedor";
};
type ApiResp<T = any> = { ok: boolean; error?: string } & T;

/* ===== Config API / Auth ===== */
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

/* Helpers específicos de auth */
async function safeAuthHasUsers(): Promise<ApiResp<{ hasUsers: boolean }>> {
  return httpJSON("GET", "/api/auth/hasUsers");
}

async function safeAuthLogin(
  username: string,
  pin: string
): Promise<ApiResp<{ user: User; token?: string }>> {
  return httpJSON("POST", "/api/auth/login", { username, pin });
}

/* ===== Tokens de tema ===== */
const YRGB = "244,194,43";
const BG = "#f7f8fb";
const TEXT = "#222831";
const MUTED = "#6b7280";
const RADIUS = 14;

/* ===== Estilos base (inline) ===== */

/* Contenedor raíz mobile-first */
const shell: React.CSSProperties = {
  minHeight: "100vh",
  background: BG,
  color: TEXT,
  display: "flex",
};

/* Zona central adaptable a tablet y móvil */
const main: React.CSSProperties = {
  flex: 1,
  display: "grid",
  placeItems: "center",
  padding: "clamp(12px, 4vw, 28px)",
};

/* Contenedor de la tarjeta con ancho fluido */
const container: React.CSSProperties = {
  width: "100%",
  maxWidth: "min(520px, 96vw)",
};

/* Tarjeta con “glass” y borde amarillo */
const card: React.CSSProperties = {
  position: "relative",
  borderRadius: RADIUS,
  border: `1px solid rgba(${YRGB},0.42)`,
  background: "transparent",
  overflow: "hidden",
  boxShadow: "var(--card-shadow)",
};

/* Capa de glass y sombra */
const cardSkin: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(255,255,255,0.7)",
  boxShadow: `inset 0 -1px 0 rgba(${YRGB},0.10)`,
  backdropFilter: "saturate(160%) blur(8px)",
  WebkitBackdropFilter: "saturate(160%) blur(8px)",
  transition: "transform 160ms ease",
  willChange: "transform",
  pointerEvents: "none",
};

/* Contenido interno con espacio adaptable */
const cardContent: React.CSSProperties = {
  position: "relative",
  padding: "clamp(16px, 4vw, 22px)",
  display: "grid",
  gap: "clamp(10px, 2.4vh, 16px)",
  transition: "transform 160ms ease",
  willChange: "transform",
};

/* Línea superior amarilla */
const accentTop: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: 2,
  borderTopLeftRadius: RADIUS,
  borderTopRightRadius: RADIUS,
  pointerEvents: "none",
  background: `linear-gradient(90deg, rgba(${YRGB},0.28), rgba(${YRGB},0.12) 60%, rgba(255,255,255,0))`,
};

/* Texto y controles */
const title: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(22px, 4.4vw, 28px)",
  fontWeight: 800,
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gap: "clamp(10px, 2vh, 14px)",
  marginTop: 4,
};

const fieldBlock: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const formLabel: React.CSSProperties = {
  display: "block",
  fontSize: "clamp(11px, 2.4vw, 13px)",
  color: MUTED,
  fontWeight: 700,
};

const inputWrap: React.CSSProperties = {
  position: "relative",
  display: "grid",
  alignItems: "center",
};

/* Icono izquierdo dentro del input */
const leftIcon: React.CSSProperties = {
  position: "absolute",
  left: 10,
  top: "50%",
  transform: "translateY(-50%)",
  color: MUTED,
};

/* Botón de ojo, tamaño táctil */
const rightIconBtn: React.CSSProperties = {
  position: "absolute",
  right: 8,
  top: "50%",
  transform: "translateY(-50%)",
  display: "grid",
  placeItems: "center",
  width: 34,
  height: 34,
  borderRadius: 999,
  border: `1px solid rgba(0,0,0,0.06)`,
  background: "#fff",
  cursor: "pointer",
};

/* Input táctil, sin zoom molesto */
const input: React.CSSProperties = {
  width: "100%",
  height: "clamp(44px, 6.2vh, 52px)",
  padding: "0 46px 0 36px",
  borderRadius: 12,
  background: "#fff",
  border: "1px solid #e5e7eb",
  outline: "none",
  minWidth: 0,
  boxSizing: "border-box",
  fontSize: "clamp(15px, 2.8vw, 17px)",
};

/* Botones grandes para tablet */
const btnPrimary: React.CSSProperties = {
  width: "100%",
  padding: "clamp(10px, 2.4vh, 13px) 12px",
  borderRadius: 12,
  border: `1px solid rgba(${YRGB},0.8)`,
  background: "linear-gradient(180deg, #ffffff, rgba(255,255,255,0.9))",
  color: TEXT,
  fontWeight: 800,
  fontSize: "clamp(15px, 3vw, 17px)",
  cursor: "pointer",
  transition:
    "transform 160ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease",
};

const btnGhost: React.CSSProperties = {
  width: "100%",
  padding: "clamp(9px, 2.2vh, 12px) 12px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: TEXT,
  fontWeight: 600,
  fontSize: "clamp(14px, 2.7vw, 16px)",
  cursor: "pointer",
  transition:
    "transform 160ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease",
};

/* Aviso de primer administrador */
const notice: React.CSSProperties = {
  padding: "clamp(8px, 1.8vh, 10px)",
  borderRadius: 10,
  border: `1px solid rgba(${YRGB},0.5)`,
  background: "rgba(255,255,0,0.08)",
  color: "#5a4700",
  fontWeight: 600,
  fontSize: "clamp(12px, 2.5vw, 14px)",
};

/* Caja de error */
const errorBox: React.CSSProperties = {
  color: "#b00020",
  background: "rgba(176,0,32,0.08)",
  border: "1px solid rgba(176,0,32,0.28)",
  padding: "clamp(8px, 1.8vh, 10px)",
  borderRadius: 10,
  fontSize: "clamp(12px, 2.5vw, 14px)",
};

/* Íconos */
const IconUser = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconLock = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const IconEye = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconEyeOff = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C5 20 1 12 1 12a21.8 21.8 0 0 1 5.06-6.94" />
    <path d="M10.58 10.58A2 2 0 1 0 13.41 13.4" />
    <path d="m1 1 22 22" />
  </svg>
);

/* ================== UI ================== */
export default function LoginPage() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [msg, setMsg] = useState("");
  const [cargando, setCargando] = useState(true);
  const [hayUsuarios, setHayUsuarios] = useState<boolean | null>(null);

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

  /* Comprobar solo si hay usuarios (ya no redirige por token) */
  useEffect(() => {
    (async () => {
      try {
        const info = await safeAuthHasUsers();
        if (info?.ok) setHayUsuarios(!!info.hasUsers);
      } catch (e: any) {
        setMsg(String(e?.message || e));
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  /* Enviar login */
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    const userTrim = username.trim();
    const pinRegex = /^\d{4,6}$/;
    if (!pinRegex.test(pin)) {
      setMsg("El PIN debe tener 4 a 6 dígitos.");
      return;
    }
    try {
      const resp = await safeAuthLogin(userTrim, pin);
      if (resp?.ok) {
        if ((resp as any).token) setToken((resp as any).token);
        navigate("/dashboard", { replace: true });
      } else {
        setMsg(resp?.error || "Usuario o PIN incorrecto");
      }
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  if (cargando) {
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
        Cargando…
      </div>
    );
  }

  return (
    <div style={shell} className="login-root">
      <div style={main}>
        <div style={container}>
          <div style={card} className="card">
            <div style={cardSkin} className="card-skin">
              <div style={accentTop} className="accent-top" />
            </div>

            <div style={cardContent} className="card-content fade-in">
              <h2 style={title} className="login-title">
                Iniciar sesión
              </h2>

              {hayUsuarios === false && (
                <div style={notice} className="slide-down">
                  No hay usuarios registrados. Crea el primer administrador.
                </div>
              )}

              <form onSubmit={onSubmit} noValidate style={formGrid}>
                {/* Usuario */}
                <div style={fieldBlock}>
                  <label style={formLabel}>Usuario</label>
                  <div style={inputWrap}>
                    <span style={leftIcon}>
                      <IconUser />
                    </span>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      style={input}
                      placeholder="Usuario"
                      autoFocus
                    />
                  </div>
                </div>

                {/* PIN */}
                <div style={fieldBlock}>
                  <label style={formLabel}>PIN</label>
                  <div style={inputWrap}>
                    <span style={leftIcon}>
                      <IconLock />
                    </span>
                    <input
                      type={showPin ? "text" : "password"}
                      inputMode="numeric"
                      autoComplete="current-password"
                      value={pin}
                      onChange={(e) =>
                        setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      required
                      style={input}
                      placeholder="4 a 6 dígitos"
                      maxLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin((v) => !v)}
                      style={rightIconBtn}
                      title={showPin ? "Ocultar PIN" : "Mostrar PIN"}
                      aria-label={showPin ? "Ocultar PIN" : "Mostrar PIN"}
                      className="btn-animate"
                    >
                      {showPin ? <IconEyeOff /> : <IconEye />}
                    </button>
                  </div>
                </div>

                {msg && (
                  <div style={errorBox} className="fade-in">
                    {msg}
                  </div>
                )}

                <button
                  type="submit"
                  style={btnPrimary}
                  className="btn-animate"
                >
                  Entrar
                </button>

                {hayUsuarios === false && (
                  <button
                    type="button"
                    onClick={() => navigate("/register")}
                    style={btnGhost}
                    className="btn-animate"
                  >
                    Crear primer administrador
                  </button>
                )}
              </form>
            </div>
          </div>

          <style>{globalCss}</style>
        </div>
      </div>
    </div>
  );
}

/* CSS embebido con animaciones y pequeños ajustes responsivos */
const globalCss = `
  html, body {
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
    margin: 0;
    padding: 0;
  }

  .login-root {
    --card-shadow: 0 12px 30px rgba(0,0,0,0.04), inset 0 -1px 0 rgba(${YRGB},0.10);
    animation: pageIn 260ms ease both;
  }

  @keyframes pageIn {
    from { opacity: 0; transform: translateY(6px) scale(0.99); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(2px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .login-root .card:hover .card-skin { transform: scale(1.02); }
  .login-root .card:hover .card-content { transform: translateY(-1px); }

  .login-root .card:active .card-skin,
  .login-root .card.pressing .card-skin { transform: scale(0.99); }
  .login-root .card:active .card-content,
  .login-root .card.pressing .card-content { transform: translateY(0); }

  .btn-animate:hover {
    transform: translateY(-1px);
    border-color: rgba(${YRGB},0.7);
    box-shadow: 0 10px 20px rgba(0,0,0,0.06);
  }
  .btn-animate:active {
    transform: translateY(0);
    box-shadow: 0 4px 10px rgba(0,0,0,0.05);
  }

  @media (min-width: 768px) {
    .login-root .login-title {
      letter-spacing: 0.02em;
    }
  }
`;

