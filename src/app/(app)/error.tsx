"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card mt-6 px-6 py-10 text-center">
      <div className="text-4xl" aria-hidden>
        😕
      </div>
      <h1 className="mt-3 text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-[15px] text-muted">Your data is safe. Please try again.</p>
      <p className="mt-1 text-[13px] text-muted">
        Setting up Pingly? <a href="/setup" className="underline">Check the configuration</a>.
      </p>
      <button type="button" className="btn-primary mt-5" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
