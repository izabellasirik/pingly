"use client";

import { useSearchParams } from "next/navigation";

export function LoginNotice() {
  const params = useSearchParams();
  const text = params.get("deleted")
    ? "Your account and all its data were deleted."
    : params.get("error") === "link"
      ? "That link has expired or was already used. Please try again."
      : null;
  if (!text) return null;
  return (
    <p className="mb-4 rounded-2xl bg-accent-soft p-3 text-[14px]" role="status">
      {text}
    </p>
  );
}
