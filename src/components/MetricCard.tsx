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
        "rounded-xl border bg-card p-4 shadow-sm",
        tone === "dark" && "border-sidebar-border bg-sidebar",
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
            className={cn("mt-1.5 text-2xl font-bold tabular-nums", tones[tone])}
            aria-busy={loading}
          >
            {loading ? "—" : value}
          </p>
          {sub && (
            <p
              className={cn(
                "mt-1 text-xs",
                tone === "dark" ? "text-sidebar-foreground/75" : "text-muted-foreground",
              )}
            >
              {sub}
            </p>
          )}
        </div>
        {Icon && <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", tones[tone])} aria-hidden />}
      </div>
    </div>
  );
}
