import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

/* Tipos base */
type Role = "admin" | "vendedor";
type User = { id: number; username: string; name: string; role: Role } | null;
type ApiResp<T = any> = { ok: boolean; error?: string } & T;

/* ===== Config / HTTP ===== */
const API_BASE = (process.env.REACT_APP_API_URL || "").replace(/\/+$/, "");

/* Lee token desde localStorage */
function getToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("authToken") || "";
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
    const response = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      credentials: "omit",
    });
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return {
        ok: false,
        error: `Respuesta no válida desde ${path}: ${text.slice(0, 120)}`,
      } as ApiResp<T>;
    }
  } catch (err: any) {
    return {
      ok: false,
      error: String(err?.message || err),
    } as ApiResp<T>;
  }
}

/* Helpers específicos de auth */
async function safeAuthMe(): Promise<ApiResp<{ user: User }>> {
  return httpJSON("GET", "/api/auth/me", undefined, { auth: true });
}

async function safeAuthHasUsers(): Promise<ApiResp<{ hasUsers: boolean }>> {
  return httpJSON("GET", "/api/auth/hasUsers");
}

async function safeAuthRegisterFirstAdmin(payload: {
  name: string;
  username: string;
  pin: string;
}): Promise<ApiResp<{ user: User; token?: string }>> {
  return httpJSON("POST", "/api/auth/register-first-admin", payload);
}

/* ===== Tokens de estilo compartidos ===== */
const YRGB = "244,194,43";
const BG = "#f7f8fb";
const TEXT = "#222831";
const MUTED = "#6b7280";
const RADIUS = 14;

/* ===== Estilos base mobile-first ===== */
const shell: React.CSSProperties = {
  minHeight: "100vh",
  background: BG,
  color: TEXT,
  display: "flex",
};

const main: React.CSSProperties = {
  flex: 1,
  display: "grid",
  placeItems: "center",
  padding: "clamp(12px, 4vw, 28px)",
};

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: "min(520px, 96vw)",
};

const card: React.CSSProperties = {
  position: "relative",
  borderRadius: RADIUS,
  border: `1px solid rgba(${YRGB},0.7)`,
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(255,255,255,0.90))",
  boxShadow:
    "0 16px 40px rgba(15,23,42,0.12), 0 0 0 1px rgba(255,255,255,0.8)",
  overflow: "hidden",
};

const cardSkin: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: RADIUS,
  background:
    "radial-gradient(circle at 0 0, rgba(255,255,255,0.9), transparent 55%), radial-gradient(circle at 100% 0, rgba(244,194,43,0.12), transparent 60%)",
  boxShadow: `inset 0 -1px 0 rgba(${YRGB},0.1)`,
  backdropFilter: "saturate(160%) blur(8px)",
  WebkitBackdropFilter: "saturate(160%) blur(8px)",
  pointerEvents: "none",
};

const cardContent: React.CSSProperties = {
  position: "relative",
  padding: "clamp(16px, 4vw, 22px)",
  display: "grid",
  gap: "clamp(10px, 2.2vh, 16px)",
};

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

const headerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const titleGroup: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const h1Style: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(20px, 4vw, 24px)",
  fontWeight: 800,
};

const subtitle: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(12px, 2.6vw, 14px)",
  color: MUTED,
};

const backBtn: React.CSSProperties = {
  width: "clamp(34px, 6vw, 40px)",
  height: "clamp(34px, 6vw, 40px)",
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.5)",
  background: "rgba(255,255,255,0.9)",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};

const iconSvgProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const IHome = () => (
  <svg {...iconSvgProps}>
    <path d="M3 11L12 3l9 8" />
    <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
  </svg>
);

const formGrid: React.CSSProperties = {
  display: "grid",
  gap: "clamp(10px, 2vh, 14px)",
  marginTop: 8,
};

const rowGrid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)",
  gap: "clamp(8px, 1.8vh, 12px)",
};

const fieldBlock: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const formLabel: React.CSSProperties = {
  fontSize: "clamp(11px, 2.4vw, 13px)",
  color: MUTED,
  fontWeight: 700,
};

const input: React.CSSProperties = {
  width: "100%",
  height: "clamp(44px, 6.2vh, 52px)",
  padding: "0 10px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "rgba(255,255,255,0.96)",
  fontSize: "clamp(14px, 2.6vw, 16px)",
  outline: "none",
  boxSizing: "border-box",
};

const btnRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 6,
};

const btnPrimary: React.CSSProperties = {
  padding: "clamp(9px, 2.2vh, 11px) 14px",
  borderRadius: 12,
  border: `1px solid rgba(${YRGB},0.8)`,
  background: "linear-gradient(180deg, #ffffff, rgba(255,255,255,0.94))",
  color: TEXT,
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "clamp(14px, 2.8vw, 16px)",
};

const btnGhost: React.CSSProperties = {
  padding: "clamp(8px, 2vh, 10px) 14px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  color: TEXT,
  cursor: "pointer",
  fontSize: "clamp(14px, 2.8vw, 16px)",
};

const infoBox: React.CSSProperties = {
  padding: "clamp(8px, 2vh, 10px)",
  borderRadius: 10,
  border: `1px solid rgba(${YRGB},0.5)`,
  background: `rgba(${YRGB},0.08)`,
  fontSize: "clamp(12px, 2.5vw, 14px)",
  color: "#92400e",
};

const okBox: React.CSSProperties = {
  padding: "clamp(8px, 2vh, 10px)",
  borderRadius: 10,
  border: "1px solid rgba(46,125,50,0.55)",
  background: "rgba(46,125,50,0.06)",
  fontSize: "clamp(12px, 2.5vw, 14px)",
  color: "#2e7d32",
};

const errorBox: React.CSSProperties = {
  padding: "clamp(8px, 2vh, 10px)",
  borderRadius: 10,
  border: "1px solid rgba(220,38,38,0.7)",
  background: "rgba(248,113,113,0.06)",
  fontSize: "clamp(12px, 2.5vw, 14px)",
  color: "#b91c1c",
};

/* ================== Página ================== */
export default function RegisterPage() {
  const navigate = useNavigate();

  const [me, setMe] = useState<User>(null);
  const [hayUsuarios, setHayUsuarios] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [msg, setMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);

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

  /* Carga inicial: usuario actual y flag de usuarios */
  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const token = getToken();
        if (token) {
          const cur = await safeAuthMe();
          if (isMounted && cur?.ok) {
            setMe(cur.user || null);
          }
        }

        const info = await safeAuthHasUsers();
        if (isMounted && info?.ok) {
          setHayUsuarios(info.hasUsers);
        }
      } catch (e: any) {
        if (isMounted) {
          setMsg(String(e?.message || e));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  /* Enviar formulario: solo primer administrador */
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setOkMsg("");

    const nameTrim = name.trim();
    const userTrim = username.trim();
    const pinRegex = /^\d{4,6}$/;

    if (!nameTrim || !userTrim) {
      setMsg("Nombre y usuario son obligatorios.");
      return;
    }
    if (!pinRegex.test(pin)) {
      setMsg("El PIN debe tener entre 4 y 6 dígitos.");
      return;
    }
    if (pin !== pin2) {
      setMsg("Los PIN no coinciden.");
      return;
    }
    if (hayUsuarios !== false) {
      setMsg("La creación del primer administrador ya no está permitida.");
      return;
    }

    try {
      setEnviando(true);
      const resp = await safeAuthRegisterFirstAdmin({
        name: nameTrim,
        username: userTrim,
        pin,
      });

      if (resp?.ok) {
        setOkMsg(
          "Administrador creado correctamente. Ahora puedes iniciar sesión."
        );
        setTimeout(() => {
          navigate("/login", { replace: true });
        }, 800);
      } else {
        setMsg(resp?.error || "No fue posible registrar el administrador.");
      }
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setEnviando(false);
    }
  };

  /* Vista cargando */
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

  /* Si ya hay usuarios, mostrar aviso y no permitir registro */
  if (hayUsuarios) {
    return (
      <div style={shell}>
        <div style={main}>
          <div style={container}>
            <div style={card}>
              <div style={cardSkin} />
              <div style={accentTop} />
              <div style={cardContent}>
                <div style={headerRow}>
                  <button
                    type="button"
                    style={backBtn}
                    onClick={() =>
                      navigate(me ? "/dashboard" : "/login", { replace: true })
                    }
                    aria-label="Volver"
                  >
                    <IHome />
                  </button>
                  <div style={titleGroup}>
                    <h1 style={h1Style}>Registro bloqueado</h1>
                    <p style={subtitle}>
                      Ya existe al menos un usuario en el sistema.
                    </p>
                  </div>
                  <div />
                </div>

                <div style={infoBox}>
                  La creación del primer administrador solo está disponible
                  cuando no hay usuarios registrados. Para crear nuevos
                  usuarios, utiliza el módulo de administración con una cuenta
                  de administrador.
                </div>

                <div style={btnRow}>
                  <button
                    type="button"
                    style={btnPrimary}
                    onClick={() =>
                      navigate(me ? "/dashboard" : "/login", { replace: true })
                    }
                  >
                    {me ? "Ir al dashboard" : "Ir al login"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* Formulario de primer administrador */
  return (
    <div style={shell}>
      <div style={main}>
        <div style={container}>
          <div style={card}>
            <div style={cardSkin} />
            <div style={accentTop} />
            <div style={cardContent}>
              <div style={headerRow}>
                <button
                  type="button"
                  style={backBtn}
                  onClick={() => navigate("/login", { replace: true })}
                  aria-label="Volver"
                >
                  <IHome />
                </button>
                <div style={titleGroup}>
                  <h1 style={h1Style}>Registrar administrador</h1>
                  <p style={subtitle}>
                    Crea el primer usuario administrador del sistema.
                  </p>
                </div>
                <div />
              </div>

              <div style={infoBox}>
                Este registro solo se usa una vez, para crear el administrador
                inicial. Guarda bien el usuario y el PIN.
              </div>

              {okMsg && <div style={okBox}>{okMsg}</div>}
              {msg && <div style={errorBox}>{msg}</div>}

              <form onSubmit={onSubmit} noValidate style={formGrid}>
                <div style={rowGrid2}>
                  <div style={fieldBlock}>
                    <label style={formLabel}>Nombre</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      style={input}
                      placeholder="Nombre completo"
                      required
                    />
                  </div>
                  <div style={fieldBlock}>
                    <label style={formLabel}>Usuario</label>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      style={input}
                      placeholder="Nombre de usuario"
                      required
                    />
                  </div>
                </div>

                <div style={rowGrid2}>
                  <div style={fieldBlock}>
                    <label style={formLabel}>PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      placeholder="4 a 6 dígitos"
                      value={pin}
                      onChange={(e) =>
                        setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      required
                      style={input}
                      maxLength={6}
                    />
                  </div>
                  <div style={fieldBlock}>
                    <label style={formLabel}>Confirmar PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      placeholder="Repite el PIN"
                      value={pin2}
                      onChange={(e) =>
                        setPin2(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      required
                      style={input}
                      maxLength={6}
                    />
                  </div>
                </div>

                <div style={btnRow}>
                  <button
                    type="button"
                    style={btnGhost}
                    onClick={() => navigate("/login", { replace: true })}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    style={{
                      ...btnPrimary,
                      opacity: enviando ? 0.7 : 1,
                    }}
                    disabled={enviando}
                  >
                    {enviando ? "Registrando..." : "Registrar administrador"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
