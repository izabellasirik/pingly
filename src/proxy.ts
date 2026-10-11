import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets, images and the server-to-server cron
    // endpoint (which authenticates with its own secret).
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
