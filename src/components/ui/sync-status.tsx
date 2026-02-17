import { Cloud, CloudOff, RefreshCw, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type SyncState = "synced" | "syncing" | "offline" | "error";

interface SyncStatusProps {
  state: SyncState;
  message?: string;
  className?: string;
  showLabel?: boolean;
}

const stateConfig: Record<SyncState, { icon: typeof Cloud; label: string; color: string }> = {
  synced: {
    icon: Check,
    label: "Sincronizado",
    color: "text-green-600",
  },
  syncing: {
    icon: RefreshCw,
    label: "Sincronizando...",
    color: "text-blue-600",
  },
  offline: {
    icon: CloudOff,
    label: "Sin conexión",
    color: "text-amber-600",
  },
  error: {
    icon: AlertCircle,
    label: "Error de sincronización",
    color: "text-red-600",
  },
};

/**
 * Component to display data synchronization status.
 * Shows different icons and colors based on sync state.
 */
export function SyncStatus({ 
  state, 
  message, 
  className,
  showLabel = true 
}: SyncStatusProps) {
  const config = stateConfig[state];
  const Icon = config.icon;
  
  return (
    <div className={cn("flex items-center gap-1.5 text-sm", config.color, className)}>
      <Icon 
        className={cn(
          "h-4 w-4",
          state === "syncing" && "animate-spin"
        )} 
      />
      {showLabel && (
        <span className="text-xs font-medium">
          {message || config.label}
        </span>
      )}
    </div>
  );
}

/**
 * Badge variant for compact display
 */
interface SyncBadgeProps {
  state: SyncState;
  className?: string;
}

export function SyncBadge({ state, className }: SyncBadgeProps) {
  const config = stateConfig[state];
  const Icon = config.icon;
  
  const bgColors: Record<SyncState, string> = {
    synced: "bg-green-100 border-green-200",
    syncing: "bg-blue-100 border-blue-200",
    offline: "bg-amber-100 border-amber-200",
    error: "bg-red-100 border-red-200",
  };
  
  return (
    <span 
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
        bgColors[state],
        config.color,
        className
      )}
    >
      <Icon 
        className={cn(
          "h-3 w-3",
          state === "syncing" && "animate-spin"
        )} 
      />
      {config.label}
    </span>
  );
}

export default SyncStatus;
