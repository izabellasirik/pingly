"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * The always-visible "tell Pingly" box. Hands the text to Ask AI, which
 * extracts details and asks for confirmation before anything is saved.
 */
export function CaptureBox({ placeholder = "Tell Pingly something to remember…" }: { placeholder?: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  return (
    <form
      className="card flex items-center gap-2 p-2 pl-4 transition focus-within:ring-2 focus-within:ring-accent/40"
      onSubmit={(e) => {
        e.preventDefault();
        const q = text.trim();
        if (!q) return;
        router.push(`/ask?q=${encodeURIComponent(q)}`);
      }}
    >
      <label htmlFor="capture" className="sr-only">
        Tell Pingly something
      </label>
      <input
        id="capture"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent py-2 text-[16px] outline-none placeholder:text-muted"
        autoComplete="off"
        enterKeyHint="send"
      />
      <button type="submit" className="btn-accent !size-10 !p-0" aria-label="Send to Pingly" disabled={!text.trim()}>
        <ArrowUp className="size-5" aria-hidden />
      </button>
    </form>
  );
}
