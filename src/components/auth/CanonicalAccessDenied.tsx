import { useEffect, useRef } from "react";

type Props = Readonly<{
  onReturnToSafeRoute: () => void;
}>;

export function CanonicalAccessDenied({ onReturnToSafeRoute }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6" data-testid="hub-forbidden" data-authorization-boundary="pre-lazy">
      <section className="w-full max-w-lg rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold text-red-700">403 · Acceso no autorizado</p>
        <h1 ref={headingRef} tabIndex={-1} className="mt-3 text-2xl font-black text-slate-950">
          No puedes abrir esta aplicación
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Tu sesión no tiene acceso a esta ruta. La aplicación protegida no fue cargada.
        </p>
        <button
          type="button"
          onClick={onReturnToSafeRoute}
          className="mt-6 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
        >
          Volver a una ruta segura
        </button>
      </section>
    </main>
  );
}
