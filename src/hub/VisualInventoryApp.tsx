import { ArrowLeft, Images } from "lucide-react";
import inventoryDocument from "@/internal-tools/visual-inventory/index.html?raw";

type Props = Readonly<{
  onBack: () => void;
}>;

export default function VisualInventoryApp({ onBack }: Props) {
  return (
    <section className="flex min-h-screen flex-col bg-slate-100" data-testid="visual-inventory-app">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-2 py-1.5 shadow-sm sm:px-4">
        <button type="button" onClick={onBack} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />OSi Plus Mobile
        </button>
        <span className="hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
        <span className="flex min-w-0 items-center gap-2"><Images className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" /><strong className="truncate text-sm text-slate-950">Inventario Visual</strong></span>
        <span className="ml-auto rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-amber-800">Independiente · conexión ERP pendiente</span>
      </header>
      <iframe
        title="Inventario Visual"
        srcDoc={inventoryDocument}
        sandbox="allow-downloads allow-forms allow-modals allow-same-origin allow-scripts"
        allow="camera"
        referrerPolicy="no-referrer"
        className="min-h-[calc(100vh-53px)] w-full flex-1 border-0 bg-white"
        data-testid="visual-inventory-frame"
      />
    </section>
  );
}
