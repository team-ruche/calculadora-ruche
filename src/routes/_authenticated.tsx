import { createFileRoute, Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { BottomNav } from "@/components/BottomNav";
import { isRucheOnlyRoute } from "@/lib/navigation";
import { ChevronDown, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { DefinirSenha } from "@/components/DefinirSenha";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session, user, loading, isAprovado, isRuche, passwordRecovery, signOut } = useAuth();
  const path = useRouterState({ select: (r) => r.location.pathname });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" />;

  // First access (temporary password / invite) or recovery → set a new password.
  if (passwordRecovery || user?.must_change_password) {
    return (
      <DefinirSenha title={passwordRecovery ? "Reset password" : "Set your access password"} />
    );
  }

  if (user && !isAprovado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Registration pending</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your account ({user.email}) is awaiting approval from a Ruche admin. You'll get access
              as soon as it's approved.
            </p>
            <Button variant="outline" className="w-full" onClick={() => signOut()}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Restrict the route before mounting its component or running its data effects.
  if (!isRuche && isRucheOnlyRoute(path)) return <Navigate to="/overview" replace />;

  return (
    <div className="flex min-h-screen w-full min-w-0 flex-col">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b bg-background px-4 sm:px-6">
        <Link to="/overview" className="flex items-baseline gap-2" aria-label="Ruche Partner home">
          <span className="text-xl font-bold tracking-tight">
            ruche<span className="text-brand-ink">.</span>
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">Partner</span>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="min-w-0 gap-2 text-sm">
              <span className="max-w-40 truncate">{user?.nome || "Account"}</span>
              <span className="hidden rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground sm:inline">
                {isRuche ? "Ruche team" : "Partner"}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
              {user?.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <main className="min-w-0 flex-1 p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
