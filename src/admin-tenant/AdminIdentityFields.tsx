import { useEffect, useId, useRef, useState } from "react";
import { Camera, Mail, Phone, Trash2, UserRound } from "lucide-react";
import { AdministrationHelp, AdministrationIconAction } from "@/administration/AdministrationHelp";
import type { IdentityDocumentType } from "./adminUserIdentityApi";

export type IdentityFieldsDraft = Readonly<{
  name: string;
  documentType: IdentityDocumentType;
  documentNumber: string;
  phone: string;
  email: string;
  contactEmail: string;
}>;

export type IdentityPhotoDraft = File | "REMOVE" | null;

type Props = Readonly<{
  draft: IdentityFieldsDraft;
  onChange(value: IdentityFieldsDraft): void;
  photo: IdentityPhotoDraft;
  onPhotoChange(value: IdentityPhotoDraft): void;
  photoUrl?: string | null;
  photoLoading?: boolean;
  disabled?: boolean;
  emailEditable?: boolean;
  maxPhotoBytes?: number;
}>;

const PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const inputClass = "mt-1 h-10 w-full min-w-0 rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500";

function identityInitials(name: string) {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  return words.length ? `${words[0][0]}${words.length > 1 ? words[words.length - 1][0] : ""}`.toLocaleUpperCase("es-DO") : "";
}

/** The caller supplies an authenticated blob URL; no public profile URL is fetched here. */
export function AdminIdentityAvatar({ name, photoUrl, size = "small" }: { name: string; photoUrl?: string | null; size?: "small" | "large" }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initials = identityInitials(name);
  const safeUrl = photoUrl?.startsWith("blob:") ? photoUrl : null;
  return <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 font-semibold text-slate-600 ${size === "large" ? "h-20 w-20 text-xl" : "h-9 w-9 text-xs"}`} aria-hidden="true">
    {safeUrl && failedUrl !== safeUrl
      ? <img src={safeUrl} alt="" className="h-full w-full object-cover" onError={() => setFailedUrl(safeUrl)} />
      : initials || <UserRound className={size === "large" ? "h-8 w-8" : "h-4 w-4"} />}
  </span>;
}

export default function AdminIdentityFields({ draft, onChange, photo, onPhotoChange, photoUrl, photoLoading = false, disabled = false, emailEditable = false, maxPhotoBytes = 2 * 1024 * 1024 }: Props) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [localPhotoUrl, setLocalPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    if (!(photo instanceof File)) { setLocalPhotoUrl(null); return undefined; }
    const url = URL.createObjectURL(photo);
    setLocalPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const selectPhoto = (file: File | undefined) => {
    if (!file || disabled) return;
    if (!PHOTO_MIME_TYPES.has(file.type) || file.size < 1 || file.size > maxPhotoBytes) {
      setPhotoError(`Seleccione una foto JPG, PNG o WebP de hasta ${Math.round(maxPhotoBytes / (1024 * 1024))} MB.`);
      return;
    }
    setPhotoError(null);
    onPhotoChange(file);
  };
  const visiblePhoto = photo === "REMOVE" ? null : localPhotoUrl || photoUrl;

  return <section aria-label="Datos de identidad" className="space-y-4">
    <div className="flex items-center gap-4">
      <AdminIdentityAvatar name={draft.name} photoUrl={visiblePhoto} size="large" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1"><span className="text-xs font-semibold text-slate-700">Foto de perfil</span><AdministrationHelp title="Foto de perfil"><p>Seleccione una fotografía JPG, PNG o WebP. Se guarda con la ficha y sólo está disponible para quienes pueden consultar la identidad.</p><p>Puede completar la ficha sin fotografía; se mostrarán las iniciales.</p></AdministrationHelp></div>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Seleccionar foto de perfil" className="sr-only" disabled={disabled} onChange={(event) => { selectPhoto(event.target.files?.[0]); event.target.value = ""; }} />
        <div className="flex flex-wrap items-center gap-2">
          <AdministrationIconAction label={visiblePhoto ? "Cambiar foto" : "Añadir foto"} mobileLabel="Foto" disabled={disabled} onClick={() => fileInput.current?.click()}><Camera aria-hidden="true" className="h-4 w-4" /></AdministrationIconAction>
          {(visiblePhoto || photo instanceof File) && <AdministrationIconAction label="Quitar foto" disabled={disabled} onClick={() => { setPhotoError(null); onPhotoChange("REMOVE"); }}><Trash2 aria-hidden="true" className="h-4 w-4" /></AdministrationIconAction>}
          <span className="text-xs text-slate-500">{photoLoading ? "Cargando foto…" : photo instanceof File ? "Foto seleccionada" : photo === "REMOVE" ? "Se quitará al guardar" : "JPG, PNG o WebP"}</span>
        </div>
      </div>
    </div>
    {photoError && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-xs text-red-800">{photoError}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <label htmlFor={`${id}-name`} className="text-xs font-semibold text-slate-700 sm:col-span-2">Nombre completo<input id={`${id}-name`} autoComplete="name" maxLength={160} value={draft.name} disabled={disabled} onChange={(event) => onChange({ ...draft, name: event.target.value })} className={inputClass} /></label>
      <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 sm:col-span-2"><label htmlFor={`${id}-document-type`} className="text-xs font-semibold text-slate-700">Documento<select id={`${id}-document-type`} aria-label="Tipo de documento" value={draft.documentType} disabled={disabled} onChange={(event) => onChange({ ...draft, documentType: event.target.value as IdentityDocumentType })} className={`${inputClass} px-2`}><option value="CEDULA">Cédula</option><option value="PASSPORT">Pasaporte</option><option value="OTHER">Otro</option></select></label><label htmlFor={`${id}-document`} className="text-xs font-semibold text-slate-700">Número de documento<input id={`${id}-document`} aria-label="Cédula / documento" autoComplete="off" maxLength={40} value={draft.documentNumber} disabled={disabled} onChange={(event) => onChange({ ...draft, documentNumber: event.target.value })} className={inputClass} /></label></div>
      <label htmlFor={`${id}-phone`} className="text-xs font-semibold text-slate-700">Teléfono<span className="relative block"><Phone aria-hidden="true" className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-slate-400" /><input id={`${id}-phone`} type="tel" autoComplete="tel" maxLength={40} placeholder="+1 809…" value={draft.phone} disabled={disabled} onChange={(event) => onChange({ ...draft, phone: event.target.value })} className={`${inputClass} pl-9`} /></span></label>
      <label htmlFor={`${id}-email`} className="text-xs font-semibold text-slate-700">Correo electrónico<span className="relative block"><Mail aria-hidden="true" className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-slate-400" /><input id={`${id}-email`} aria-label="Correo electrónico" type="email" autoComplete="email" maxLength={320} value={draft.email} disabled={disabled || !emailEditable} onChange={(event) => onChange({ ...draft, email: event.target.value })} aria-describedby={!emailEditable ? `${id}-email-note` : undefined} className={`${inputClass} pl-9`} /></span>{!emailEditable && <span id={`${id}-email-note`} className="mt-1 block text-[11px] font-normal text-slate-500">Correo de inicio de sesión. Se conserva al actualizar esta ficha.</span>}</label>
      {!emailEditable && <label htmlFor={`${id}-contact-email`} className="text-xs font-semibold text-slate-700 sm:col-span-2">Correo de contacto <span className="font-normal text-slate-400">(opcional)</span><input id={`${id}-contact-email`} type="email" autoComplete="off" maxLength={320} value={draft.contactEmail} disabled={disabled} onChange={(event) => onChange({ ...draft, contactEmail: event.target.value })} className={inputClass} /></label>}
    </div>
  </section>;
}
