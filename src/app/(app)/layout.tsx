import Link from "next/link";
import { CircleUser } from "lucide-react";
import { Logo } from "@/components/Logo";
import { TabBar } from "@/components/TabBar";
import { TimezoneSync } from "@/components/TimezoneSync";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Link href="/" aria-label="Pingly home">
            <Logo className="text-lg" />
          </Link>
          <TabBar variant="top" />
          <Link href="/account" className="btn-ghost -mr-2 !p-2" aria-label="Account">
            <CircleUser className="size-6" aria-hidden />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-32 pt-4 md:pb-16">{children}</main>
      <TabBar variant="bottom" />
      <TimezoneSync />
    </div>
  );
}
