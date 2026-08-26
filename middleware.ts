import { NextRequest, NextResponse } from "next/server"

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.stellar.org https://soroban-testnet.stellar.org wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ")

export function middleware(request: NextRequest): NextResponse {
  const response = NextResponse.next()

  response.headers.set("Content-Security-Policy", CSP)

  return response
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
}
