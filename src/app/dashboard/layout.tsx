import type { Metadata } from "next";
import { Suspense } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Skeleton } from "@/components/dashboard/ui";
import { ROLE_LABELS, requireUser } from "@/lib/auth";
import { NAV, getSelectedBranch, visibleBranches } from "@/lib/dashboard";
import { db } from "@/lib/prisma";

export const metadata: Metadata = { title: { default: "Panel", template: "%s · Panel DP" }, robots: { index: false } };
// El panel depende de la sesión en cada request: no se valida como navegación instantánea.
export const instant = false;

async function Shell() {
  const user = await requireUser();
  const [branches, selected, prisma] = await Promise.all([visibleBranches(user), getSelectedBranch(user), db()]);
  const unread = user.role === "STYLIST" ? 0 : (
    await prisma.conversation.aggregate({
      _sum: { unreadCount: true },
      where: { isSimulator: false, ...(user.branchIds ? { OR: [{ branchId: { in: user.branchIds } }, { branchId: null }] } : {}) },
    })
  )._sum.unreadCount ?? 0;
  return (
    <Sidebar
      nav={NAV.filter((n) => n.roles.includes(user.role)).map(({ href, label, icon }) => ({ href, label, icon: icon as "chart" }))}
      user={{ name: user.name, roleLabel: ROLE_LABELS[user.role] }}
      branches={branches.map((b) => ({ id: b.id, name: b.name }))}
      selected={selected}
      canPickAll={user.branchIds === null}
      unread={unread}
    />
  );
}

function ShellFallback() {
  return (
    <aside className="hidden h-dvh w-64 shrink-0 flex-col gap-4 border-r border-line p-4 lg:flex">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10" />
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-9" />
      ))}
    </aside>
  );
}


export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="min-h-dvh bg-ivory lg:flex">
      <Suspense fallback={<ShellFallback />}>
        <Shell />
      </Suspense>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        {children}
      </main>
    </div>
  );
}
