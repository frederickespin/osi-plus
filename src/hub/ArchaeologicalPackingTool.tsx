import { ArrowLeft, Calculator } from "lucide-react";
import calculatorDocument from "@/internal-tools/archaeological-packing/index.html?raw";
import spreadsheetLibraryUrl from "@/internal-tools/archaeological-packing/vendor/xlsx.full.min.js?url";

type Props = Readonly<{
  onBack: () => void;
}>;

const INTERNAL_CALCULATOR_DOCUMENT = calculatorDocument.replace("./vendor/xlsx.full.min.js", spreadsheetLibraryUrl);

export default function ArchaeologicalPackingTool({ onBack }: Props) {
  return (
    <section className="flex min-h-screen flex-col bg-slate-100" data-testid="archaeological-packing-tool">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-3 py-2 shadow-sm sm:px-5">
        <button type="button" onClick={onBack} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />Herramientas
        </button>
        <span className="hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
        <span className="flex min-w-0 items-center gap-2"><Calculator className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" /><strong className="truncate text-sm text-slate-950">Calculadora de empaque arqueológico</strong></span>
        <span className="ml-auto rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">Interna · sin conexión ERP</span>
      </header>
      <iframe
        title="Calculadora de empaque arqueológico"
        srcDoc={INTERNAL_CALCULATOR_DOCUMENT}
        sandbox="allow-downloads allow-forms allow-modals allow-same-origin allow-scripts"
        referrerPolicy="no-referrer"
        className="min-h-[calc(100vh-57px)] w-full flex-1 border-0 bg-white"
        data-testid="archaeological-packing-frame"
      />
    </section>
  );
}
