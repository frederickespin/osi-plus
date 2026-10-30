import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Close as PopoverClose } from "@radix-ui/react-popover";
import { CircleHelp, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function AdministrationHelp({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Ayuda de ${title}`} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:h-8 sm:w-8">
          <CircleHelp aria-hidden="true" className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} collisionPadding={12} aria-labelledby={headingId} className="max-h-[70vh] w-80 max-w-[calc(100vw-24px)] overflow-y-auto p-3">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h3 id={headingId} className="text-sm font-semibold text-slate-950">{title}</h3>
          <PopoverClose asChild>
            <button type="button" aria-label="Cerrar ayuda" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </PopoverClose>
        </div>
        <div className="space-y-2 text-xs leading-5 text-slate-600">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

type IconActionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children" | "title"> & {
  label: string;
  mobileLabel?: string;
  children: ReactNode;
};

export function AdministrationIconAction({ label, mobileLabel, children, className, type = "button", ...props }: IconActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button {...props} type={type} aria-label={label} className={cn("inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-40 sm:h-8 sm:min-w-8", className)}>
          {children}
          {mobileLabel && <span className="sm:hidden">{mobileLabel}</span>}
        </button>
      </TooltipTrigger>
      <TooltipContent sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  );
}
