import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, MobileBottomNav } from "@/components/AppSidebar";
import { useAuth } from "@/hooks/use-auth";
import { DefinirSenha } from "@/components/DefinirSenha";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session, user, loading, isAprovado, passwordRecovery, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" />;

  // 1º acesso (senha temporária / convite) ou recuperação → definir nova senha.
  if (passwordRecovery || user?.must_change_password) {
    return (
      <DefinirSenha title={passwordRecovery ? "Redefinir senha" : "Defina sua senha de acesso"} />
    );
  }

  if (user && !isAprovado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Cadastro pendente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sua conta ({user.email}) está aguardando aprovação de um admin da Ruche. Você receberá
              acesso assim que for aprovada.
            </p>
            <Button variant="outline" className="w-full" onClick={() => signOut()}>
              Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background px-4">
            <SidebarTrigger />
            <div className="text-sm text-muted-foreground">Ruche Partner</div>
          </header>
          <main className="min-w-0 flex-1 p-4 pb-24 sm:p-6 sm:pb-24 md:pb-6">
            <Outlet />
          </main>
        </div>
        <MobileBottomNav />
      </div>
    </SidebarProvider>
  );
}
