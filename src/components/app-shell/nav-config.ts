import { BookOpen, Clock, LayoutDashboard, LayoutTemplate, Megaphone, MessagesSquare, Settings } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/crm", label: "CRM", icon: MessagesSquare },
  { href: "/follow-ups", label: "Follow-ups", icon: Clock },
  // Route stays /campaigns: renaming it would break every existing bookmark
  // and the links in already-sent notifications, for no gain the owner can see.
  { href: "/campaigns", label: "Bulk Sender", icon: Megaphone },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
