import * as React from "react";
import { cn } from "@/lib/utils";

interface ResponsiveTableProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Wrapper component that makes tables horizontally scrollable on small screens.
 * Wrap your Table component with this to ensure proper mobile display.
 */
export function ResponsiveTable({ children, className, ...props }: ResponsiveTableProps) {
  return (
    <div 
      className={cn(
        "w-full overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0",
        "scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent",
        className
      )} 
      {...props}
    >
      <div className="min-w-[600px] sm:min-w-0">
        {children}
      </div>
    </div>
  );
}

/**
 * Card-based list view for mobile displays.
 * Use this as an alternative to tables on very small screens.
 */
interface MobileCardListProps<T> {
  items: T[];
  renderCard: (item: T, index: number) => React.ReactNode;
  emptyMessage?: string;
  className?: string;
}

export function MobileCardList<T>({ 
  items, 
  renderCard, 
  emptyMessage = "No hay elementos",
  className 
}: MobileCardListProps<T>) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {renderCard(item, index)}
        </React.Fragment>
      ))}
    </div>
  );
}

export default ResponsiveTable;
