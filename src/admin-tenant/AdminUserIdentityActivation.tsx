import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, BadgeCheck, Building2, ExternalLink, Mail, UserRound } from "lucide-react";
import { loadSession } from "@/lib/sessionStore";
import { ADMIN_MEMBERSHIP_ROLE_OPTIONS, isAdminMembershipRole } from "../../shared/adminMembershipCatalog.js";
import { clearAdminUserIdentityActivationToken, readAdminUserIdentityActivationToken } from "./adminUserIdentityActivationRoute";

type Activation = Readonly<{
  mode: "NEW_IDENTITY" | "EXISTING_IDENTITY";
  name: string;
  email: string;
  role: string;
  tenantName: string;
  expiresAt: string;
}>;

function parseActivation(value: unknown): Activation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.ok !== true || !body.activation || typeof body.activation !== "object" || Array.isArray(body.activation)) return null;
  const activation = body.activation as Record<string, unknown>;
  if (activation.mode !== "NEW_IDENTITY" && activation.mode !== "EXISTING_IDENTITY") return null;
  if (!isAdminMembershipRole(activation.role) || activation.role === "A") return null;
  if (typeof activation.name !== "string" || activation.name.length > 160 || typeof activation.email !== "string" || activation.email.length > 320 || typeof activation.tenantName !== "string" || activation.tenantName.length > 240 || typeof activation.expiresAt !== "string" || !Number.isFinite(Date.parse(activation.expiresAt))) return null;
  return activation as Activation;
}

function validPassword(value: string) {
  const hasControl = [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  return value.length >= 14 && value.length <= 128 && value === value.trim() && !hasControl
    && /[a-z]/u.test(value) && /[A-Z]/u.test(value) && /[0-9]/u.test(value) && /[^A-Za-z0-9\s]/u.test(value);
}

export function AdminUserIdentityActivation() {
  const [token] = useState(readAdminUserIdentityActivationToken);
  const request = useRef<Promise<Activation | null> | null>(null);
  const mounted = useRef(false);
  const [activation, setActivation] = useState<Activation | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState<"RESOLVING" | "READY" | "SAVING" | "DONE" | "INVALID" | "UNCERTAIN">("RESOLVING");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    clearAdminUserIdentityActivationToken();
    document.getElementById("user-activation-title")?.focus();
    if (!token) { setState("INVALID"); return undefined; }
    request.current ??= fetch("/api/admin/user-enrollments/activate", {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
      body: JSON.stringify({ action: "RESOLVE", token }),
    }).then(async (response) => response.ok ? parseActivation(await response.json()) : null).catch(() => null);
    let active = true;
    void request.current.then((result) => {
      if (!active) return;
      setActivation(result); setState(result ? "READY" : "INVALID");
    });
    return () => { active = false; };
  }, [token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !activation || state !== "READY") return;
    if (activation.mode === "NEW_IDENTITY") {
      if (!validPassword(password)) { setError("Use entre 14 y 128 caracteres, con mayúscula, minúscula, número y símbolo, sin espacios al inicio o al final."); return; }
      if (password !== confirmation) { setError("Las contraseñas no coinciden."); return; }
    }
    const session = activation.mode === "EXISTING_IDENTITY" ? loadSession() : null;
    if (activation.mode === "EXISTING_IDENTITY" && !session?.token) { setError("Inicie sesión con el correo indicado en otra pestaña y vuelva para aceptar el acceso."); return; }
    setState("SAVING"); setError(null);
    try {
      const response = await fetch("/api/admin/user-enrollments/activate", {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}) },
        body: JSON.stringify(activation.mode === "NEW_IDENTITY" ? { action: "ACTIVATE", token, password } : { action: "ACTIVATE", token }),
      });
      const body = await response.json().catch(() => null) as { ok?: unknown; activated?: unknown; loginRequired?: unknown; error?: unknown } | null;
      if (!mounted.current) return;
      if (response.ok && body?.ok === true && body.activated === true && body.loginRequired === true) setState("DONE");
      else if (response.status === 401 && activation.mode === "EXISTING_IDENTITY") {
        setError("La sesión debe corresponder al correo indicado. Inicie sesión con esa cuenta y vuelva para aceptar el acceso."); setState("READY");
      } else if (response.status === 400 && body?.error === "ADMIN_USER_IDENTITY_PASSWORD_POLICY_INVALID") {
        setError("La contraseña no cumple los requisitos. Escriba una nueva contraseña."); setState("READY");
      } else setState(response.status >= 500 || response.ok || !body ? "UNCERTAIN" : "INVALID");
    } catch { if (mounted.current) setState("UNCERTAIN"); }
    finally { if (mounted.current) { setPassword(""); setConfirmation(""); } }
  };

  const roleName = ADMIN_MEMBERSHIP_ROLE_OPTIONS.find((role) => role.code === activation?.role)?.label || activation?.role;
  return <main className="grid min-h-screen place-items-center bg-slate-950 p-4 text-slate-950 sm:p-6">
    <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-8" aria-labelledby="user-activation-title">
      <BadgeCheck className="h-8 w-8 text-indigo-600" aria-hidden="true" />
      <h1 id="user-activation-title" tabIndex={-1} className="mt-4 text-2xl font-bold outline-none">Activar acceso a OSi Plus</h1>
      {state === "RESOLVING" ? <p className="mt-5 text-sm text-slate-600" role="status">Verificando enlace…</p> : state === "DONE" ? <div className="mt-5 space-y-4">
        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900" role="status">Acceso activado. Ya puede iniciar sesión con su correo y contraseña.</p>
        <a href="/hub" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white">Ir al Hub <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
      </div> : state === "INVALID" || state === "UNCERTAIN" ? <div className="mt-5 space-y-4">
        <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{state === "UNCERTAIN" ? "No se pudo confirmar el resultado. Pruebe a iniciar sesión para comprobar si el acceso quedó activado." : "El enlace no está disponible o venció. Solicite a Administración un nuevo enlace de activación."}</p>
        <a href="/hub" className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700">Ir al inicio de sesión <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
      </div> : activation ? <>
        <dl className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex items-start gap-3"><UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" /><div className="min-w-0"><dt className="sr-only">Persona</dt><dd className="break-words font-semibold">{activation.name}</dd><dd className="mt-0.5 text-xs text-slate-600">{roleName}</dd></div></div>
          <div className="flex items-start gap-3"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" /><div className="min-w-0"><dt className="sr-only">Correo de acceso</dt><dd className="break-all">{activation.email}</dd></div></div>
          <div className="flex items-start gap-3"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" /><div className="min-w-0"><dt className="sr-only">Empresa</dt><dd className="break-words">{activation.tenantName}</dd></div></div>
        </dl>
        <form onSubmit={submit} className="mt-5 space-y-4">
          {activation.mode === "NEW_IDENTITY" ? <>
            <label className="block text-sm font-semibold">Nueva contraseña<input required minLength={14} maxLength={128} type="password" autoComplete="new-password" value={password} disabled={state === "SAVING"} onChange={(event) => setPassword(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3" aria-describedby="user-password-help" /></label>
            <label className="block text-sm font-semibold">Confirmar contraseña<input required minLength={14} maxLength={128} type="password" autoComplete="new-password" value={confirmation} disabled={state === "SAVING"} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
            <p id="user-password-help" className="text-xs text-slate-500">Entre 14 y 128 caracteres con mayúscula, minúscula, número y símbolo.</p>
          </> : <div className="space-y-2 text-sm text-slate-600">
            <p>Inicie sesión con el correo indicado y vuelva a esta pestaña para aceptar el acceso a la empresa.</p>
            <a href="/hub" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-indigo-700">Abrir inicio de sesión <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">en otra pestaña</span></a>
          </div>}
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <button disabled={state === "SAVING"} className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{state === "SAVING" ? "Activando…" : activation.mode === "NEW_IDENTITY" ? "Activar cuenta" : "Aceptar acceso"}</button>
        </form>
      </> : null}
    </section>
  </main>;
}
