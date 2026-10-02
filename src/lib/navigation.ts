import { Calculator, DollarSign, FileText, LayoutDashboard, Users, Wallet } from "lucide-react";

export const navigationItems = [
  { title: "Overview", url: "/overview", icon: LayoutDashboard, rucheOnly: false },
  { title: "Quotes", url: "/orcamentos", icon: FileText, rucheOnly: false },
  { title: "Payments", url: "/pagamentos", icon: DollarSign, rucheOnly: true },
  { title: "Pricing", url: "/motor", icon: Calculator, rucheOnly: true },
  { title: "Financial Control", url: "/visao-interna", icon: Wallet, rucheOnly: true },
  { title: "Users", url: "/usuarios", icon: Users, rucheOnly: true },
] as const;

export const isActiveRoute = (path: string, url: string) =>
  path === url || path.startsWith(`${url}/`);
export const isRucheOnlyRoute = (path: string) =>
  navigationItems.some((item) => item.rucheOnly && isActiveRoute(path, item.url));
