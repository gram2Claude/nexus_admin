import type { NextAuthConfig } from "next-auth";

// Базовая часть конфига; полный NextAuth (провайдеры + jwt-перепроверка из БД)
// собирается в auth.ts. В Next 16 proxy.ts работает в Node — edge-ограничений нет.
export const authConfig = {
  pages: { signIn: "/login" },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 дней (решение спеки 2.1)
    // примечание (ревью 2.1): для JWT-стратегии скользящее продление делает
    // переустановка cookie в proxy при визитах; session.updateAge тут не действует
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user; // не авторизован → redirect на pages.signIn
    },
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as import("@/lib/rbac").Role;
      }
      return session;
    },
  },
  providers: [], // провайдеры добавляются в auth.ts (node-рантайм)
} satisfies NextAuthConfig;
