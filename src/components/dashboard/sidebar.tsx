"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { BarChart3, Bot, CalendarDays, ListChecks, LogOut, Menu, MessageCircle, Settings, Users, X } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { logout } from "@/app/login/actions";
import { setBranch } from "@/app/dashboard/actions";

const ICONS = { chart: BarChart3, calendar: CalendarDays, list: ListChecks, users: Users, chat: MessageCircle, bot: Bot, settings: Settings };

interface Props {
  nav: Array<{ href: string; label: string; icon: keyof typeof ICONS }>;
  user: { name: string; roleLabel: string };
  branches: Array<{ id: string; name: string }>;
  selected: string;
  canPickAll: boolean;
  unread: number;
}

export function Sidebar({ nav, user, branches, selected, canPickAll, unread }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const content = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href="/" className="flex items-center gap-2 px-2 pt-1" aria-label="Ir a la web">
        <LogoMark className="h-7 w-7" title="" />
        <span className="font-display text-xl leading-none">
          Doménica <em>Padilla</em>
        </span>
      </Link>

      <div className="px-1">
        <label htmlFor="branch-picker" className="mb-1 block text-[11px] font-medium tracking-wide text-muted uppercase">
          Sede
        </label>
        <select
          id="branch-picker"
          value={selected}
          disabled={pending || (!canPickAll && branches.length <= 1)}
          onChange={(e) => start(() => setBranch(e.target.value))}
          className="h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm font-medium focus:border-ink focus:outline-none"
        >
          {canPickAll || branches.length > 1 ? <option value="all">{canPickAll ? "Todas las sedes" : "Mis sedes"}</option> : null}
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <nav aria-label="Secciones" className="flex flex-1 flex-col gap-0.5">
        {nav.map((item) => {
          const Icon = ICONS[item.icon];
          const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                active ? "bg-ink text-paper" : "text-ink-soft hover:bg-sand",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="flex-1">{item.label}</span>
              {item.icon === "chat" && unread > 0 ? (
                <span className={cn("rounded-full px-1.5 text-[11px] font-semibold", active ? "bg-paper text-ink" : "bg-rose text-white")}>{unread}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3 rounded-2xl border border-line bg-paper p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="text-xs text-muted">{user.roleLabel}</p>
        </div>
        <form action={logout}>
          <button type="submit" className="rounded-lg p-2 text-muted hover:bg-sand hover:text-ink" aria-label="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-ivory/90 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <LogoMark className="h-6 w-6" title="" />
          <span className="font-display text-lg">Doménica Padilla</span>
        </Link>
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-sand" aria-label="Abrir menú" aria-expanded={open}>
          <Menu className="h-5 w-5" />
        </button>
      </div>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-line bg-ivory lg:block">{content}</aside>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <button className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} aria-label="Cerrar menú" />
          <aside className="absolute inset-y-0 left-0 w-72 bg-ivory shadow-xl">
            <button onClick={() => setOpen(false)} className="absolute top-4 right-3 rounded-lg p-2 hover:bg-sand" aria-label="Cerrar menú">
              <X className="h-5 w-5" />
            </button>
            {content}
          </aside>
        </div>
      ) : null}
    </>
  );
}
