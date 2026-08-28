import { FormEvent, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { loadSession } from "@/lib/sessionStore";
import { clearAdminIdentityActivationToken, readAdminIdentityActivationToken } from "./adminIdentityActivationRoute";

export function AdminIdentityActivation() {
  const [token] = useState(() => readAdminIdentityActivationToken());
  const [existingSession] = useState(() => loadSession());
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState<"READY" | "SAVING" | "DONE" | "ERROR">("READY");

  useEffect(() => {
    clearAdminIdentityActivationToken();
    document.querySelector<HTMLElement>("h1")?.focus();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || password !== confirmation) { setState("ERROR"); return; }
    setState("SAVING");
    try {
      const response = await fetch("/api/auth/admin-invitations/activate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(existingSession?.token ? { Authorization: `Bearer ${existingSession.token}` } : {}),
        },
        body: JSON.stringify(existingSession?.token ? { token } : { token, name, password }),
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
      <p className="mt-2 text-sm text-slate-600">Defina sus credenciales. La activación no inicia sesión automáticamente.</p>
      {state === "DONE" ? <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900" role="status">Cuenta activada. Continúe con el inicio de sesión normal.</div> : <form onSubmit={submit} className="mt-6 space-y-4">
        {existingSession?.token ? <p className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900">La identidad existente se verificará con su sesión actual. Su contraseña no será reemplazada.</p> : <>
          <label className="block text-sm font-semibold">Nombre completo<input required minLength={2} maxLength={160} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-11 w-full rounded-lg border px-3" /></label>
          <label className="block text-sm font-semibold">Nueva contraseña<input required minLength={14} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 h-11 w-full rounded-lg border px-3" /></label>
          <label className="block text-sm font-semibold">Confirmar contraseña<input required minLength={14} maxLength={128} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 h-11 w-full rounded-lg border px-3" /></label>
          <p className="text-xs text-slate-500">Mínimo 14 caracteres con mayúscula, minúscula, número y símbolo.</p>
        </>}
        {state === "ERROR" && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">El enlace no es válido o no pudo completarse la activación.</p>}
        <button disabled={state === "SAVING"} className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{state === "SAVING" ? "Activando…" : existingSession?.token ? "Aceptar invitación" : "Activar cuenta"}</button>
      </form>}
    </section>
  </main>;
}
