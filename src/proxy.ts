import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

// Next 16: proxy.ts (бывший middleware). Всё кроме /login, /set-password,
// /api/auth и статики закрыто — callbacks.authorized в auth.config.ts.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    "/((?!api/auth|login|set-password|_next/static|_next/image|favicon.ico).*)",
  ],
};
