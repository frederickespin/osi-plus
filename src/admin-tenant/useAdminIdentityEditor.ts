import { useCallback, useEffect, useRef, useState } from "react";
import { AdminApiError } from "./adminApi";
import { AdminUserIdentityApi, prepareIdentityPhoto, type AdminUserIdentity, type AdminUserIdentityChanges } from "./adminUserIdentityApi";
import type { IdentityFieldsDraft, IdentityPhotoDraft } from "./AdminIdentityFields";

export function identityErrorText(error: unknown) {
  const code = error instanceof AdminApiError ? error.code : "";
  return ({
    ADMIN_USER_IDENTITY_VERSION_CONFLICT: "La ficha cambió. Recargue su contenido antes de guardar.",
    ADMIN_USER_IDENTITY_CONCURRENT_CHANGE: "La ficha cambió. Recargue su contenido antes de guardar.",
    ADMIN_USER_IDENTITY_DOCUMENT_DUPLICATE: "Este documento ya está registrado en la empresa.",
    ADMIN_USER_IDENTITY_DUPLICATE_DOCUMENT: "Este documento ya está registrado en la empresa.",
    ADMIN_USER_IDENTITY_FORBIDDEN: "No tiene permiso para esta operación.",
    ADMIN_USER_IDENTITY_NOT_FOUND: "La persona ya no está disponible en esta empresa.",
    ADMIN_USER_IDENTITY_INVALID: "Revise el nombre, documento, teléfono y correo introducidos.",
    ADMIN_USER_IDENTITY_INPUT_INVALID: "Revise el nombre, documento, teléfono y correo introducidos.",
    ADMIN_USER_IDENTITY_PHOTO_INVALID: "No fue posible preparar la foto. Seleccione una imagen JPG, PNG o WebP válida.",
    ADMIN_USER_IDENTITY_PHOTO_NOT_FOUND: "La foto no está disponible. Puede recargar la ficha.",
    ADMIN_USER_IDENTITY_ADMIN_ENROLLMENT_REQUIRED: "El alta de un administrador requiere su proceso de aprobación específico.",
    ADMIN_USER_ENROLLMENT_PENDING: "Ya existe un alta pendiente para este correo. Revísela antes de crear otra.",
    ADMIN_USER_ENROLLMENT_EXISTS: "Esta cuenta ya tiene acceso a la empresa.",
    ADMIN_USER_IDENTITY_ALREADY_MEMBER: "Esta cuenta ya tiene acceso a la empresa.",
    ADMIN_USER_IDENTITY_EMAIL_CONFLICT: "Esta cuenta ya tiene acceso a la empresa.",
    ADMIN_USER_IDENTITY_ENROLLMENT_PENDING: "Ya existe un alta pendiente para este correo. Revísela antes de crear otra.",
    ADMIN_USER_IDENTITY_ENROLLMENT_NOT_PENDING: "El alta ya cambió de estado. Recargue para comprobar el resultado.",
    ADMIN_USER_IDENTITY_SCHEMA_UNAVAILABLE: "La ficha de identidad todavía no está disponible. Intente nuevamente más tarde.",
  } as Record<string, string>)[code] || "No fue posible completar la operación. Recargue para confirmar el estado actual.";
}

function draftOf(identity: AdminUserIdentity): IdentityFieldsDraft {
  return { name: identity.name, documentType: identity.documentType, documentNumber: identity.documentNumber || "", phone: identity.phone, email: identity.email, contactEmail: identity.contactEmail || "" };
}
function changesOf(identity: AdminUserIdentity | null, draft: IdentityFieldsDraft | null): AdminUserIdentityChanges {
  if (!identity || !draft) return {};
  const result: AdminUserIdentityChanges = {};
  if (draft.name.trim() !== identity.name) result.name = draft.name.trim();
  if (draft.phone.trim() !== identity.phone) result.phone = draft.phone.trim();
  if ((draft.contactEmail.trim() || null) !== identity.contactEmail) result.contactEmail = draft.contactEmail.trim() || null;
  if (draft.documentType !== identity.documentType) result.documentType = draft.documentType;
  if ((draft.documentNumber.trim() || null) !== identity.documentNumber) result.documentNumber = draft.documentNumber.trim() || null;
  return result;
}

export function useIdentityPhoto(api: AdminUserIdentityApi, membershipRef: string | null, hasPhoto: boolean, photoVersion: number) {
  const [state, setState] = useState<{ api: AdminUserIdentityApi; ref: string; version: number; url: string | null; loading: boolean; failed: boolean } | null>(null);
  useEffect(() => {
    if (!membershipRef || !hasPhoto) return undefined;
    const controller = new AbortController();
    let url: string | null = null;
    void api.photo(membershipRef, controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setState({ api, ref: membershipRef, version: photoVersion, url, loading: false, failed: false });
    }).catch(() => { if (!controller.signal.aborted) setState({ api, ref: membershipRef, version: photoVersion, url: null, loading: false, failed: true }); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [api, membershipRef, hasPhoto, photoVersion]);
  return hasPhoto && state?.api === api && state.ref === membershipRef && state.version === photoVersion ? state : { url: null, loading: Boolean(membershipRef && hasPhoto), failed: false };
}

export function useAdminIdentityEditor({ api, membershipRef, enabled, onUpdated, onUnauthorized }: {
  api: AdminUserIdentityApi;
  membershipRef: string | null;
  enabled: boolean;
  onUpdated(identity: AdminUserIdentity, saved?: boolean): void;
  onUnauthorized(): void;
}) {
  const [identity, setIdentity] = useState<AdminUserIdentity | null>(null);
  const [draft, setDraft] = useState<IdentityFieldsDraft | null>(null);
  const [photo, setPhoto] = useState<IdentityPhotoDraft>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [reloadErrors, setReloadErrors] = useState<Readonly<Record<string, string>>>({});
  const reloadErrorsRef = useRef(reloadErrors);
  const editorEpoch = useRef(0);
  const readController = useRef<AbortController | null>(null);
  const pending = useRef(new Set<AbortController>());
  const callbacks = useRef({ onUpdated, onUnauthorized });
  useEffect(() => { callbacks.current = { onUpdated, onUnauthorized }; }, [onUpdated, onUnauthorized]);
  useEffect(() => { reloadErrorsRef.current = reloadErrors; }, [reloadErrors]);

  useEffect(() => {
    const requests = pending.current;
    setSaving(false); setReloadErrors({}); reloadErrorsRef.current = {};
    return () => { requests.forEach((controller) => controller.abort()); requests.clear(); };
  }, [api]);

  const clearReload = (ref: string) => setReloadErrors((current) => { const next = { ...current }; delete next[ref]; reloadErrorsRef.current = next; return next; });
  const read = useCallback(async (ref: string, epoch: number) => {
    readController.current?.abort();
    const controller = new AbortController(); readController.current = controller; pending.current.add(controller);
    setLoading(true); setError(null); setSaved(false);
    try {
      const value = await api.get(ref, controller.signal);
      if (controller.signal.aborted || epoch !== editorEpoch.current) return;
      setIdentity(value); setDraft(draftOf(value)); setPhoto(null); clearReload(ref);
      callbacks.current.onUpdated(value);
    } catch (cause) {
      if (controller.signal.aborted || epoch !== editorEpoch.current) return;
      if (cause instanceof AdminApiError && cause.status === 401) callbacks.current.onUnauthorized();
      else setError(identityErrorText(cause));
    } finally {
      pending.current.delete(controller);
      if (readController.current === controller) readController.current = null;
      if (!controller.signal.aborted && epoch === editorEpoch.current) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const epoch = ++editorEpoch.current;
    readController.current?.abort(); readController.current = null;
    setIdentity(null); setDraft(null); setPhoto(null); setLoading(false); setSaved(false); setError(null);
    if (!enabled || !membershipRef) return undefined;
    if (reloadErrorsRef.current[membershipRef]) setError(reloadErrorsRef.current[membershipRef]);
    else void read(membershipRef, epoch);
    return () => { editorEpoch.current += 1; readController.current?.abort(); readController.current = null; };
  }, [enabled, membershipRef, read]);

  const mustReload = Boolean(membershipRef && reloadErrors[membershipRef]);
  const current = identity?.membershipRef === membershipRef ? identity : null;
  const changes = changesOf(current, draft);
  const photoChanged = photo instanceof File || photo === "REMOVE" && Boolean(current?.hasPhoto);
  const hasChanges = Object.keys(changes).length > 0 || photoChanged;
  const photoState = useIdentityPhoto(api, current?.membershipRef || null, Boolean(current?.hasPhoto), current?.photoVersion || 0);
  const save = async () => {
    if (!enabled || !current || !draft || !current.canEdit || saving || loading || mustReload || !hasChanges) return;
    const controller = new AbortController(); pending.current.add(controller);
    const epoch = editorEpoch.current; const ref = current.membershipRef;
    setSaving(true); setError(null); setSaved(false);
    let sent = false;
    try {
      const photoBase64 = photo instanceof File ? await prepareIdentityPhoto(photo, controller.signal) : photo === "REMOVE" ? null : undefined;
      if (controller.signal.aborted) return;
      sent = true;
      const value = await api.update(ref, { requestId: crypto.randomUUID(), expectedVersion: current.version, ...changes, ...(photoBase64 === undefined ? {} : { photoBase64 }) }, controller.signal);
      if (controller.signal.aborted) return;
      clearReload(ref); callbacks.current.onUpdated(value, true);
      if (epoch === editorEpoch.current) { setIdentity(value); setDraft(draftOf(value)); setPhoto(null); setSaved(true); }
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof AdminApiError && cause.status === 401) callbacks.current.onUnauthorized();
      else {
        const message = identityErrorText(cause);
        const uncertain = sent && (!(cause instanceof AdminApiError) || cause.status >= 500 || cause.status === 409 || cause.status === 403);
        if (uncertain) setReloadErrors((previous) => { const next = { ...previous, [ref]: message }; reloadErrorsRef.current = next; return next; });
        if (epoch === editorEpoch.current) setError(message);
      }
    } finally { pending.current.delete(controller); if (!controller.signal.aborted) setSaving(false); }
  };
  return {
    identity: current, draft: current ? draft : null, photo, loading, saving, error, saved, mustReload, hasChanges, photoState,
    hasPendingConfirmation: Object.keys(reloadErrors).length > 0,
    setDraft(value: IdentityFieldsDraft) { setDraft(value); setSaved(false); },
    setPhoto(value: IdentityPhotoDraft) { setPhoto(value); setSaved(false); },
    reload() { if (membershipRef && !saving && !loading) void read(membershipRef, editorEpoch.current); },
    save,
  };
}
