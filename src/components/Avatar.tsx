const PALETTE = [
  ["#ffe4d6", "#b4471f"],
  ["#dbeafe", "#1e4fa8"],
  ["#dcfce7", "#1f7a45"],
  ["#f3e8ff", "#6b34b0"],
  ["#fef3c7", "#8a5a00"],
  ["#fce7f3", "#a3245f"],
  ["#e0f2fe", "#0b6a94"],
];

function hash(text: string) {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const [bg, fg] = PALETTE[hash(name) % PALETTE.length];
  const dims = size === "lg" ? "size-16 text-xl" : size === "sm" ? "size-8 text-xs" : "size-11 text-sm";
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${dims}`}
      style={{ background: bg, color: fg }}
    >
      {initials(name) || "?"}
    </span>
  );
}
