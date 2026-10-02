import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type MetricTone = "neutral" | "primary" | "danger" | "warn" | "success" | "dark";
const tones: Record<MetricTone, string> = {
  neutral: "text-foreground",
  primary: "text-foreground",
  danger: "text-destructive",
  warn: "text-brand-ink",
  success: "text-success",
  dark: "text-sidebar-foreground",
};

export function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "neutral",
  loading = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  tone?: MetricTone;
  loading?: boolean;
}) {
  return (
    <div
      className={cn(
        "metric-card glass-panel relative overflow-hidden rounded-2xl p-4 sm:p-5",
        tone === "dark" && "metric-card-dark",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "text-xs font-medium",
              tone === "dark" ? "text-sidebar-foreground/75" : "text-muted-foreground",
            )}
          >
            {label}
          </p>
          <p
            className={cn(
              "mt-3 text-[26px] font-semibold leading-none tracking-[-0.04em] tabular-nums sm:text-[30px]",
              tones[tone],
            )}
            aria-busy={loading}
          >
            {loading ? "—" : value}
          </p>
          {sub && (
            <p
              className={cn(
                "mt-2 text-xs leading-relaxed",
                tone === "dark" ? "text-sidebar-foreground/75" : "text-muted-foreground",
              )}
            >
              {sub}
            </p>
          )}
        </div>
        {Icon && (
          <span
            className={cn(
              "metric-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              tone === "dark" ? "bg-white/10" : "bg-muted/70",
            )}
          >
            <Icon className={cn("h-4 w-4", tones[tone])} aria-hidden />
          </span>
        )}
      </div>
    </div>
  );
}
