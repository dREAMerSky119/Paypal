import {
  BarChart3, CalendarDays, Compass, Globe2, LayoutDashboard, Leaf,
  MapPinned, ShieldAlert, Sparkles, WalletCards,
} from "lucide-react";

export const navGroups = [
  { label: "WORKSPACE", items: [
    { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/app/inventory", label: "Inventory", icon: Compass },
    { to: "/app/ai-studio", label: "AI studio", icon: Sparkles, tag: "BETA" },
    { to: "/app/packages", label: "Packages", icon: WalletCards },
    { to: "/app/itinerary-studio", label: "Itinerary studio", icon: MapPinned },
  ]},
  { label: "INTELLIGENCE", items: [
    { to: "/app/analytics", label: "Profitability", icon: BarChart3 },
    { to: "/app/forecast", label: "Demand forecast", icon: CalendarDays },
    { to: "/app/simulator", label: "Market simulator", icon: Globe2 },
    { to: "/app/anomalies", label: "Anomaly watch", icon: ShieldAlert },
    { to: "/app/responsible-travel", label: "Responsible travel", icon: Leaf },
  ]},
];

export const navItems = navGroups.flatMap((group) => group.items);
