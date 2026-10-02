import { Link, useRouterState } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { navigationItems, isActiveRoute } from "@/lib/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useState } from "react";

export function BottomNav() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { isRuche } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const visible = navigationItems.filter((item) => !item.rucheOnly || isRuche);
  const extra = visible.slice(3);
  const moreActive = extra.some((item) => isActiveRoute(path, item.url));
  const linkClass = (active: boolean) =>
    `flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-primary sm:min-w-24 sm:flex-none sm:px-4 ${active ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"}`;

  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border bg-sidebar px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-lg"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-center gap-1 sm:gap-2">
        {visible.map((item, index) => {
          const active = isActiveRoute(path, item.url);
          return (
            <Link
              key={item.url}
              to={item.url}
              aria-current={active ? "page" : undefined}
              className={`${linkClass(active)} ${index >= 3 ? "hidden md:flex" : ""}`}
            >
              <item.icon className="h-5 w-5" aria-hidden />
              <span className="text-center">{item.title}</span>
            </Link>
          );
        })}
        {extra.length > 0 && (
          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`${linkClass(moreActive)} md:hidden`}
                aria-label="More navigation options"
              >
                <MoreHorizontal className="h-5 w-5" aria-hidden />
                <span>More</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" side="top" className="mb-3 w-60 p-2">
              {extra.map((item) => (
                <Link
                  key={item.url}
                  to={item.url}
                  onClick={() => setMoreOpen(false)}
                  aria-current={isActiveRoute(path, item.url) ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent ${isActiveRoute(path, item.url) ? "bg-accent font-semibold" : ""}`}
                >
                  <item.icon className="h-4 w-4" aria-hidden />
                  {item.title}
                </Link>
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </nav>
  );
}
