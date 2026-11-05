import { NextResponse, type NextRequest } from "next/server";

/**
 * First line of defence: anyone without a session cookie is sent to the login
 * page (and back to where they were afterwards). The session itself is
 * validated against the database by requireUser() in every page, action and
 * API route — this proxy only checks that a cookie exists.
 */
const PUBLIC_PATHS = ["/login", "/api/health"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const hasSession = Boolean(request.cookies.get("nei_session")?.value);

  if (!isPublic && !hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  // Let pages know their own path, so requireUser() can redirect back after login.
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname + search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Everything except Next.js build assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
