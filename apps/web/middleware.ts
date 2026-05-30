import { NextRequest, NextResponse } from "next/server";

/**
 * Admin access guard.
 *
 * /admin and /api/admin are completely hidden when ADMIN_PASSWORD is not set —
 * they return 404 so the route appears not to exist at all.
 *
 * Optional extra hardening: set ADMIN_ALLOWED_IPS to a comma-separated list
 * of IP addresses (e.g. "1.2.3.4,5.6.7.8"). When set, any request from an
 * IP not on the list is also returned as 404 — even with the correct password.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminRoute =
    pathname.startsWith("/admin") || pathname.startsWith("/api/admin");

  if (!isAdminRoute) return NextResponse.next();

  // ── 1. Hide entirely when ADMIN_PASSWORD is not configured ─────────────────
  if (!process.env.ADMIN_PASSWORD) {
    return new NextResponse(null, { status: 404 });
  }

  // ── 2. Optional IP allowlist ────────────────────────────────────────────────
  // Set ADMIN_ALLOWED_IPS="1.2.3.4,5.6.7.8" in Railway to lock admin access
  // to specific IPs. Leave it unset to allow any IP (password still required).
  const allowedIPs = process.env.ADMIN_ALLOWED_IPS;
  if (allowedIPs) {
    // Railway forwards the real client IP in X-Forwarded-For
    const clientIP =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "";

    const allowed = allowedIPs.split(",").map((ip) => ip.trim());
    if (!clientIP || !allowed.includes(clientIP)) {
      return new NextResponse(null, { status: 404 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
