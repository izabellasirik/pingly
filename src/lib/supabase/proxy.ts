import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicKey, getSupabaseUrl, hasRequiredSupabaseConfig } from "@/lib/config";

const PUBLIC_PATHS = ["/login", "/signup", "/forgot", "/auth", "/setup"];

/**
 * Refreshes the Supabase session cookie on every navigation and sends
 * signed-out visitors to /login. This is an optimistic check only: every
 * page, action and query re-verifies the user on the server, and RLS
 * enforces ownership in the database.
 */
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Not configured yet (e.g. a fresh deploy): explain what's missing instead
  // of failing every request with a bare 500.
  if (!hasRequiredSupabaseConfig()) {
    if (path === "/setup") return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    url.search = "";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    getSupabaseUrl()!,
    getSupabasePublicKey()!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Do not add code between createServerClient and getClaims: it refreshes
  // the session and must run first.
  let signedIn = false;
  try {
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  } catch (error) {
    // Supabase unreachable: treat as signed out rather than failing the request.
    console.error("[pingly] session check failed:", error);
  }
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (signedIn && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
