import { FormEvent, useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { loadSession } from "@/lib/sessionStore";
import { clearAdminIdentityActivationToken, readAdminIdentityActivationToken } from "./adminIdentityActivationRoute";

export function AdminIdentityActivation() {
  const [token] = useState(() => readAdminIdentityActivationToken());
  const resolutionRequest = useRef<Promise<"NEW_IDENTITY" | "EXISTING_IDENTITY" | null> | null>(null);
  const [mode, setMode] = useState<"NEW_IDENTITY" | "EXISTING_IDENTITY" | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState<"RESOLVING" | "READY" | "SAVING" | "DONE" | "ERROR">("RESOLVING");

  useEffect(() => {
    clearAdminIdentityActivationToken();
    document.querySelector<HTMLElement>("h1")?.focus();
    if (!token) { setState("ERROR"); return; }
    resolutionRequest.current ??= fetch("/api/auth/admin-invitations/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "RESOLVE", token }),
    }).then(async (response) => {
      const body = await response.json().catch(() => null) as { ok?: unknown; mode?: unknown } | null;
      return response.ok && body?.ok === true && (body.mode === "NEW_IDENTITY" || body.mode === "EXISTING_IDENTITY")
        ? body.mode : null;
    }).catch(() => null);
    let active = true;
    void resolutionRequest.current.then((resolvedMode) => {
      if (!active) return;
      if (resolvedMode) { setMode(resolvedMode); setState("READY"); } else setState("ERROR");
    });
    return () => { active = false; };
  }, [token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !mode || (mode === "NEW_IDENTITY" && password !== confirmation)) { setState("ERROR"); return; }
    setState("SAVING");
    try {
      const existingSession = mode === "EXISTING_IDENTITY" ? loadSession() : null;
      const response = await fetch("/api/auth/admin-invitations/activate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(mode === "EXISTING_IDENTITY" && existingSession?.token ? { Authorization: `Bearer ${existingSession.token}` } : {}),
        },
        body: JSON.stringify(mode === "EXISTING_IDENTITY"
          ? { action: "ACTIVATE", token }
          : { action: "ACTIVATE", token, name, password }),
      });
      const body = await response.json().catch(() => null) as { ok?: unknown } | null;
      setState(response.ok && body?.ok === true ? "DONE" : "ERROR");
      setPassword(""); setConfirmation("");
    } catch { setState("ERROR"); setPassword(""); setConfirmation(""); }
  };

  return <main className="grid min-h-screen place-items-center bg-slate-950 p-5 text-slate-950">
    <section className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl" aria-labelledby="activation-title">
      <ShieldCheck className="h-8 w-8 text-indigo-600" aria-hidden="true" />
      <h1 id="activation-title" tabIndex={-1} className="mt-4 text-2xl font-black outline-none">Activar cuenta administrativa</h1>
      <p className="mt-2 text-sm text-slate-600">El servidor verificará la invitación antes de presentar el flujo de activación.</p>
      {state === "RESOLVING" ? <p className="mt-6 text-sm text-slate-600" role="status">Verificando invitación…</p> : state === "DONE" ? <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900" role="status">Cuenta activada. Continúe con el inicio de sesión normal.</div> : mode ? <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === "EXISTING_IDENTITY" ? <p className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900">La identidad existente se verificará con su sesión actual. Su contraseña no será reemplazada.</p> : <>
          <label className="block text-sm font-semibold">Nombre completo<input required minLength={2} maxLength={160} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-11 w-full rounded-lg border px-3" /></label>
          <label className="block text-sm font-semibold">Nueva contraseña<input required minLength={14} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 h-11 w-full rounded-lg border px-3" /></label>
          <label className="block text-sm font-semibold">Confirmar contraseña<input required minLength={14} maxLength={128} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 h-11 w-full rounded-lg border px-3" /></label>
          <p className="text-xs text-slate-500">Mínimo 14 caracteres con mayúscula, minúscula, número y símbolo.</p>
        </>}
        {state === "ERROR" && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">El enlace no es válido o no pudo completarse la activación.</p>}
        <button disabled={state === "SAVING"} className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{state === "SAVING" ? "Activando…" : mode === "EXISTING_IDENTITY" ? "Aceptar invitación" : "Activar cuenta"}</button>
      </form> : <p role="alert" className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-800">El enlace no es válido o no pudo completarse la activación.</p>}
    </section>
  </main>;
}
