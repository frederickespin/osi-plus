import { useMemo, useState } from "react";
import { Box, Building2, Check, ChevronDown, Clock3, PackageCheck, Save, Sparkles, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ServiceMaterialPolicy, ServicePackage } from "./api";

type ContentProfileCode = "STANDARD_HOME" | "DELICATE" | "GLASS_HEAVY" | "OFFICE" | "CUSTOM";
type AccessProfileCode = "EASY" | "STANDARD" | "COMPLEX";
type ContentMix = Readonly<{ regular: number; fragile: number; packed: number }>;
type QuickQuotePreference = Readonly<{
  schemaVersion: 1;
  volumeM3: number | null;
  contentProfile: ContentProfileCode;
  contentMix: ContentMix;
  accessProfile: AccessProfileCode;
  additions: readonly string[];
}>;

type Props = Readonly<{
  packages: readonly ServicePackage[];
  policies: readonly ServiceMaterialPolicy[];
  initialPackageVersionRef: string;
  initialPolicyVersionRef: string;
  initialDurationHours: string;
  initialPreference: Record<string, unknown>;
  disabled: boolean;
  saving: boolean;
  onConfirm(input: Readonly<{ packageVersionRef: string; policyVersionRef: string; durationHours: string; preference: QuickQuotePreference }>): void;
}>;

const VOLUMES = [5, 10, 20, 30, 40] as const;
const PROFILES: readonly Readonly<{ code: ContentProfileCode; name: string; description: string; mix: ContentMix }>[] = [
  { code: "STANDARD_HOME", name: "Hogar regular", description: "Mobiliario y cajas de uso normal", mix: { regular: 60, fragile: 10, packed: 30 } },
  { code: "DELICATE", name: "Delicado", description: "Más protección y manipulación", mix: { regular: 40, fragile: 35, packed: 25 } },
  { code: "GLASS_HEAVY", name: "Cristalería", description: "Alta presencia de frágiles", mix: { regular: 25, fragile: 55, packed: 20 } },
  { code: "OFFICE", name: "Oficina", description: "Mobiliario, archivos y equipos", mix: { regular: 55, fragile: 10, packed: 35 } },
];
const ACCESS: readonly Readonly<{ code: AccessProfileCode; name: string; description: string }>[] = [
  { code: "EASY", name: "Fácil", description: "Acceso directo y estacionamiento" },
  { code: "STANDARD", name: "Regular", description: "Acceso urbano habitual" },
  { code: "COMPLEX", name: "Complejo", description: "Restricciones o recorrido difícil" },
];
const ADDITIONS = [
  ["STAIRS", "Escaleras"], ["LONG_CARRY", "Acarreo largo"], ["ASSEMBLY", "Armar / desarmar"], ["CRANE", "Grúa"],
  ["WOOD_CRATE", "Huacal"], ["EXTRA_STOP", "Parada adicional"], ["WAITING", "Espera"], ["SPECIAL_HOURS", "Horario especial"],
] as const;

function finiteNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function initialQuickPreference(value: Record<string, unknown>): QuickQuotePreference {
  const quick = value.quickQuote && typeof value.quickQuote === "object" && !Array.isArray(value.quickQuote) ? value.quickQuote as Record<string, unknown> : {};
  const profile = PROFILES.find((item) => item.code === quick.contentProfile);
  const mixValue = quick.contentMix && typeof quick.contentMix === "object" && !Array.isArray(quick.contentMix) ? quick.contentMix as Record<string, unknown> : {};
  const mix = {
    regular: finiteNumber(mixValue.regular) ?? profile?.mix.regular ?? 60,
    fragile: finiteNumber(mixValue.fragile) ?? profile?.mix.fragile ?? 10,
    packed: finiteNumber(mixValue.packed) ?? profile?.mix.packed ?? 30,
  };
  return Object.freeze({
    schemaVersion: 1,
    volumeM3: finiteNumber(quick.volumeM3),
    contentProfile: profile?.code ?? (quick.contentProfile === "CUSTOM" ? "CUSTOM" : "STANDARD_HOME"),
    contentMix: Object.freeze(mix),
    accessProfile: ACCESS.some((item) => item.code === quick.accessProfile) ? quick.accessProfile as AccessProfileCode : "STANDARD",
    additions: Object.freeze(Array.isArray(quick.additions) ? quick.additions.filter((item): item is string => typeof item === "string" && ADDITIONS.some(([code]) => code === item)) : []),
  });
}

function SelectCard({ selected, title, description, onClick, disabled }: Readonly<{ selected: boolean; title: string; description: string; onClick(): void; disabled: boolean }>) {
  return <button type="button" aria-pressed={selected} disabled={disabled} onClick={onClick} className={`min-h-20 rounded-xl border p-3 text-left transition ${selected ? "border-[#0070a8] bg-sky-50 shadow-sm ring-1 ring-[#0070a8]" : "border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/40"} disabled:cursor-not-allowed disabled:opacity-60`}><span className="flex items-start justify-between gap-2"><strong className="text-sm text-[#003366]">{title}</strong>{selected && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">{description}</span></button>;
}

export default function QuickQuoteConfigurator({ packages, policies, initialPackageVersionRef, initialPolicyVersionRef, initialDurationHours, initialPreference, disabled, saving, onConfirm }: Props) {
  const initial = useMemo(() => initialQuickPreference(initialPreference), [initialPreference]);
  const [packageRef, setPackageRef] = useState(initialPackageVersionRef);
  const [policyRef, setPolicyRef] = useState(initialPolicyVersionRef);
  const [volume, setVolume] = useState(initial.volumeM3 === null ? "" : String(initial.volumeM3));
  const [profileCode, setProfileCode] = useState<ContentProfileCode>(initial.contentProfile);
  const [mix, setMix] = useState<ContentMix>(initial.contentMix);
  const [accessCode, setAccessCode] = useState<AccessProfileCode>(initial.accessProfile);
  const [additions, setAdditions] = useState<readonly string[]>(initial.additions);
  const [durationHours, setDurationHours] = useState(initialDurationHours);
  const [showMix, setShowMix] = useState(initial.contentProfile === "CUSTOM");
  const selectedPackage = packages.find((item) => item.versionRef === packageRef) || null;
  const selectedProfile = PROFILES.find((item) => item.code === profileCode) || null;
  const selectedAccess = ACCESS.find((item) => item.code === accessCode) || ACCESS[1];
  const availablePolicies = policies.filter((item) => !item.packageVersionRef || item.packageVersionRef === packageRef);
  const mixTotal = mix.regular + mix.fragile + mix.packed;
  const numericVolume = volume === "" ? null : Number(volume);
  const validVolume = numericVolume === null || (Number.isFinite(numericVolume) && numericVolume > 0 && numericVolume <= 100000);
  const canSave = !disabled && Boolean(packageRef) && validVolume && mixTotal === 100 && !saving;
  const chooseProfile = (code: ContentProfileCode) => {
    const profile = PROFILES.find((item) => item.code === code);
    if (!profile) return;
    setProfileCode(code); setMix(profile.mix); setShowMix(false);
  };
  const updateMix = (key: keyof ContentMix, value: string) => {
    const next = Number(value);
    setMix((current) => ({ ...current, [key]: Number.isFinite(next) ? Math.max(0, Math.min(100, next)) : 0 }));
    setProfileCode("CUSTOM");
  };
  const confirm = () => {
    if (!canSave) return;
    onConfirm({ packageVersionRef: packageRef, policyVersionRef: policyRef, durationHours, preference: Object.freeze({ schemaVersion: 1, volumeM3: numericVolume, contentProfile: profileCode, contentMix: Object.freeze({ ...mix }), accessProfile: accessCode, additions: Object.freeze([...additions]) }) });
  };
  return <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
    <div className="min-w-0 space-y-5">
      <section aria-labelledby="quick-package-heading"><div className="mb-2 flex items-center gap-2"><PackageCheck className="h-4 w-4 text-[#0070a8]" /><h4 id="quick-package-heading" className="text-sm font-black text-[#003366]">Paquete de servicio</h4></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{packages.map((item) => <SelectCard key={item.versionRef} selected={packageRef === item.versionRef} disabled={disabled} title={item.name} description={`${item.code} · versión ${item.version}${item.description ? ` · ${item.description}` : ""}`} onClick={() => { setPackageRef(item.versionRef); setPolicyRef(""); }} />)}{packages.length === 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">No existe un paquete publicado compatible con el plan actual. Administración debe publicar uno antes de usar la preparación rápida.</p>}</div></section>
      <section aria-labelledby="quick-volume-heading"><div className="mb-2 flex items-center gap-2"><Box className="h-4 w-4 text-[#0070a8]" /><h4 id="quick-volume-heading" className="text-sm font-black text-[#003366]">Volumen estimado</h4></div><div className="flex flex-wrap gap-2">{VOLUMES.map((item) => <button key={item} type="button" disabled={disabled} aria-pressed={Number(volume) === item} onClick={() => setVolume(String(item))} className={`h-10 min-w-16 rounded-lg border px-3 text-sm font-bold ${Number(volume) === item ? "border-[#003366] bg-[#003366] text-white" : "bg-white text-slate-700 hover:border-sky-400"}`}>{item} m³</button>)}<label className="flex h-10 items-center overflow-hidden rounded-lg border bg-white pl-3 text-xs font-bold text-slate-500">Otro<input disabled={disabled} aria-label="Otro volumen en metros cúbicos" type="number" min="0.01" step="0.01" value={volume} onChange={(event) => setVolume(event.target.value)} className="h-full w-24 border-0 px-2 text-right text-sm text-slate-900 outline-none" /><span className="pr-3">m³</span></label></div>{!validVolume && <p role="alert" className="mt-1 text-xs text-rose-700">Indique un volumen mayor que cero.</p>}</section>
      <section aria-labelledby="quick-content-heading"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#0070a8]" /><h4 id="quick-content-heading" className="text-sm font-black text-[#003366]">Perfil del contenido</h4></div><button type="button" disabled={disabled} onClick={() => setShowMix((value) => !value)} className="text-xs font-bold text-[#0070a8] hover:underline">{showMix ? "Ocultar composición" : "Ajustar composición"}</button></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{PROFILES.map((item) => <SelectCard key={item.code} selected={profileCode === item.code} disabled={disabled} title={item.name} description={item.description} onClick={() => chooseProfile(item.code)} />)}</div>{showMix && <div className="mt-3 grid gap-2 rounded-xl border bg-slate-50 p-3 sm:grid-cols-3"><label className="text-xs font-bold text-slate-600">Mobiliario regular<input disabled={disabled} type="number" min="0" max="100" value={mix.regular} onChange={(event) => updateMix("regular", event.target.value)} className="mt-1 h-10 w-full rounded border bg-white px-3 text-sm" /></label><label className="text-xs font-bold text-slate-600">Frágiles y cristalería<input disabled={disabled} type="number" min="0" max="100" value={mix.fragile} onChange={(event) => updateMix("fragile", event.target.value)} className="mt-1 h-10 w-full rounded border bg-white px-3 text-sm" /></label><label className="text-xs font-bold text-slate-600">Cajas y otros<input disabled={disabled} type="number" min="0" max="100" value={mix.packed} onChange={(event) => updateMix("packed", event.target.value)} className="mt-1 h-10 w-full rounded border bg-white px-3 text-sm" /></label><p className={`sm:col-span-3 text-right text-xs font-bold ${mixTotal === 100 ? "text-emerald-700" : "text-rose-700"}`}>Total {mixTotal}%{mixTotal !== 100 ? " · debe sumar 100%" : ""}</p></div>}</section>
      <section aria-labelledby="quick-access-heading"><div className="mb-2 flex items-center gap-2"><Building2 className="h-4 w-4 text-[#0070a8]" /><h4 id="quick-access-heading" className="text-sm font-black text-[#003366]">Acceso</h4></div><div className="grid gap-2 sm:grid-cols-3">{ACCESS.map((item) => <SelectCard key={item.code} selected={accessCode === item.code} disabled={disabled} title={item.name} description={item.description} onClick={() => setAccessCode(item.code)} />)}</div></section>
      <section aria-labelledby="quick-additions-heading"><div className="mb-2 flex items-center gap-2"><Truck className="h-4 w-4 text-[#0070a8]" /><h4 id="quick-additions-heading" className="text-sm font-black text-[#003366]">Adiciones</h4></div><div className="flex flex-wrap gap-2">{ADDITIONS.map(([code, label]) => { const selected = additions.includes(code); return <button key={code} type="button" disabled={disabled} aria-pressed={selected} onClick={() => setAdditions((current) => selected ? current.filter((item) => item !== code) : [...current, code])} className={`rounded-full border px-3 py-2 text-xs font-bold ${selected ? "border-amber-500 bg-amber-50 text-amber-900" : "bg-white text-slate-600 hover:border-amber-300"}`}>{selected ? "✓ " : "+ "}{label}</button>; })}</div></section>
      <details className="rounded-lg border border-slate-200 bg-slate-50"><summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-bold text-slate-700">Detalle técnico opcional<ChevronDown className="h-4 w-4" /></summary><div className="grid gap-3 border-t bg-white p-3 sm:grid-cols-2"><label className="text-xs font-bold">Política de materiales<select disabled={disabled} value={policyRef} onChange={(event) => setPolicyRef(event.target.value)} className="mt-1 h-10 w-full rounded border px-2"><option value="">Sin política confirmada</option>{availablePolicies.map((item) => <option key={item.versionRef} value={item.versionRef}>{item.name} · {item.standardCode} · v{item.version}</option>)}</select></label><label className="text-xs font-bold">Duración preliminar editable (horas)<input disabled={disabled} type="number" min="0" step="0.5" value={durationHours} onChange={(event) => setDurationHours(event.target.value)} className="mt-1 h-10 w-full rounded border px-2" /></label><p className="sm:col-span-2 text-[11px] text-slate-500">La duración y los recursos del paquete quedan como base de trabajo. Costos aplicará después el tarifario publicado y conservará cualquier ajuste con su motivo.</p></div></details>
    </div>
    <aside className="h-fit rounded-2xl border border-sky-200 bg-gradient-to-b from-sky-50 to-white p-4 xl:sticky xl:top-3" aria-label="Resumen de preparación rápida"><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#0070a8]">Resumen siempre visible</p><h4 className="mt-1 text-lg font-black text-[#003366]">Preparación rápida</h4><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-[10px] font-bold uppercase text-slate-500">Paquete</dt><dd className="font-bold text-slate-900">{selectedPackage?.name || "Seleccione un paquete"}</dd></div><div className="grid grid-cols-2 gap-3"><div><dt className="text-[10px] font-bold uppercase text-slate-500">Volumen</dt><dd className="font-bold">{numericVolume ? `${numericVolume} m³` : "Pendiente"}</dd></div><div><dt className="text-[10px] font-bold uppercase text-slate-500">Duración</dt><dd className="flex items-center gap-1 font-bold"><Clock3 className="h-3.5 w-3.5" />{durationHours ? `${durationHours} h` : "Por calcular"}</dd></div></div><div><dt className="text-[10px] font-bold uppercase text-slate-500">Contenido</dt><dd className="font-bold">{selectedProfile?.name || "Composición personalizada"}</dd><dd className="text-[11px] text-slate-500">{mix.regular}% regular · {mix.fragile}% frágil · {mix.packed}% cajas</dd></div><div><dt className="text-[10px] font-bold uppercase text-slate-500">Acceso</dt><dd className="font-bold">{selectedAccess.name}</dd></div><div><dt className="text-[10px] font-bold uppercase text-slate-500">Adiciones</dt><dd className="text-xs">{additions.length ? ADDITIONS.filter(([code]) => additions.includes(code)).map(([, label]) => label).join(", ") : "Ninguna"}</dd></div></dl><div className="mt-4 rounded-lg bg-white p-3 text-xs text-slate-600 shadow-sm"><b className="text-[#003366]">Precio sugerido:</b> se calcula con el tarifario versionado al confirmar esta preparación. El vendedor podrá revisar el detalle antes de emitir la propuesta.</div><Button type="button" className="mt-4 w-full" disabled={!canSave} onClick={confirm}><Save />{saving ? "Confirmando…" : "Confirmar preparación"}</Button>{!packageRef && <p className="mt-2 text-center text-[11px] text-amber-800">Seleccione un paquete compatible para continuar.</p>}</aside>
  </div>;
}
