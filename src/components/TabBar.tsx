"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { MessageCircle, Sun, Users } from "lucide-react";

const TABS = [
  { href: "/", label: "Today", icon: Sun, match: (p: string) => p === "/" },
  { href: "/people", label: "People", icon: Users, match: (p: string) => p.startsWith("/people") },
  { href: "/ask", label: "Ask AI", icon: MessageCircle, match: (p: string) => p.startsWith("/ask") },
];

/** Bottom tab bar on phones; inline tabs in the header on larger screens. */
export function TabBar({ variant }: { variant: "bottom" | "top" }) {
  return (
    <Suspense fallback={<TabBarView variant={variant} pathname="" />}>
      <ActiveTabBar variant={variant} />
    </Suspense>
  );
}

function ActiveTabBar({ variant }: { variant: "bottom" | "top" }) {
  return <TabBarView variant={variant} pathname={usePathname() ?? "/"} />;
}

function TabBarView({ variant, pathname }: { variant: "bottom" | "top"; pathname: string }) {
  if (variant === "top") {
    return (
      <nav aria-label="Main" className="hidden items-center gap-1 rounded-full bg-surface-2 p-1 md:flex">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                active ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"
              }`}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-3">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <Icon className="size-6" strokeWidth={active ? 2.3 : 1.8} aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
