import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FilePlus2,
  Calculator,
  FileText,
  EyeOff,
  Users,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";

type Item = { title: string; url: string; icon: typeof LayoutDashboard; rucheOnly?: boolean };

const items: Item[] = [
  { title: "Overview", url: "/overview", icon: LayoutDashboard },
  { title: "Novo Orçamento", url: "/input", icon: FilePlus2 },
  { title: "Orçamentos", url: "/orcamentos", icon: FileText },
  { title: "Precificação", url: "/motor", icon: Calculator, rucheOnly: true },
  { title: "Controle Financeiro", url: "/visao-interna", icon: EyeOff, rucheOnly: true },
  { title: "Usuários", url: "/usuarios", icon: Users, rucheOnly: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { user, isRuche, signOut } = useAuth();

  const visible = items.filter((i) => !i.rucheOnly || isRuche);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-5">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold tracking-tight text-sidebar-foreground">ruche</span>
          <span className="text-2xl font-bold text-sidebar-primary">.</span>
        </div>
        {!collapsed && (
          <p className="text-xs text-sidebar-foreground/60">
            {isRuche ? "Internal Admin" : "Partner"}
          </p>
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visible.map((item) => {
                const active = path === item.url || path.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && user && (
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {user.nome || user.email}
            </p>
            <p className="truncate text-xs text-sidebar-foreground/60">{user.email}</p>
          </div>
        )}
        <SidebarMenuButton onClick={() => signOut()} className="text-sidebar-foreground/80">
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sair</span>}
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
