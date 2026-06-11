import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { db } from "@/lib/db";
import { isBlocked, registerFail, resetFails } from "@/lib/login-rate-limit";
import type { Role } from "@/lib/rbac";

// Холостой хэш: выравнивает время ответа для несуществующих/неактивных аккаунтов
// (ревью 2.1: timing-based user enumeration). Считается один раз при старте процесса.
const DUMMY_HASH = bcrypt.hashSync("nexus-admin-timing-equalizer", 12);

// Перепроверка роли/статуса из БД не чаще, чем раз в N мс (ревью 2.1: роль и
// status='disabled' были заморожены в JWT на 30 дней).
const REVALIDATE_MS = 10 * 60_000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
        token.chk = Date.now();
        return token;
      }
      const chk = typeof token.chk === "number" ? token.chk : 0;
      if (token.uid && Date.now() - chk > REVALIDATE_MS) {
        const { rows } = await db.query(
          "SELECT role, status FROM nexus_admin.users WHERE id = $1",
          [token.uid]
        );
        const u = rows[0];
        if (!u || u.status !== "active") return null; // disabled/удалён → сессия гаснет
        token.role = u.role as Role;
        token.chk = Date.now();
      }
      return token;
    },
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? "")
          .toLowerCase()
          .trim();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;

        if (isBlocked(email)) {
          await bcrypt.compare(password, DUMMY_HASH); // единое время ответа
          return null;
        }

        const { rows } = await db.query(
          `SELECT id, email, name, role, password_hash, status
           FROM nexus_admin.users WHERE email = $1`,
          [email]
        );
        const u = rows[0];
        if (!u || u.status !== "active" || !u.password_hash) {
          await bcrypt.compare(password, DUMMY_HASH); // единое время ответа
          registerFail(email);
          return null;
        }

        const ok = await bcrypt.compare(password, u.password_hash);
        if (!ok) {
          registerFail(email);
          return null;
        }

        resetFails(email);
        return { id: u.id, email: u.email, name: u.name, role: u.role };
      },
    }),
  ],
});
