import type { NextAuthConfig } from "next-auth";

// Edge-safe часть конфига (без БД/bcrypt) — используется и в proxy, и в node-рантайме.
export const authConfig = {
  pages: { signIn: "/login" },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 дней (решение спеки 2.1)
    updateAge: 24 * 60 * 60, // скользящее продление раз в сутки
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
