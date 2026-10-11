import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo className="text-2xl" />
          <p className="mt-2 text-[15px] text-muted">Never forget the people who matter.</p>
        </div>
        <div className="card animate-in p-6">{children}</div>
      </div>
    </main>
  );
}
