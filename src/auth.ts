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
// Env-override — только для смоук-тестов инвалидации сессий (ревью эпохи 7).
const REVALIDATE_MS = Number(process.env.AUTH_REVALIDATE_MS ?? 10 * 60_000);

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
        token.pwt = user.pwt ?? 0;
        token.chk = Date.now();
        return token;
      }
      const chk = typeof token.chk === "number" ? token.chk : 0;
      // trigger==='update' — после смены пароля инициатором (unstable_update):
      // его токен получает свежий pwt и не гаснет на следующей ревалидации
      if (token.uid && (trigger === "update" || Date.now() - chk > REVALIDATE_MS)) {
        const { rows } = await db.query(
          "SELECT role, status, pw_changed_at FROM nexus_admin.users WHERE id = $1",
          [token.uid]
        );
        const u = rows[0];
        if (!u || u.status !== "active") return null; // disabled/удалён → сессия гаснет
        // пароль сменили после входа этой сессии → cookie невалиден (ревью эпохи 7)
        const pwDb = u.pw_changed_at ? new Date(u.pw_changed_at).getTime() : 0;
        const pwTok = typeof token.pwt === "number" ? token.pwt : 0;
        if (trigger !== "update" && pwDb > pwTok) return null;
        token.pwt = pwDb;
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
        if (password.length > 72) return null; // bcrypt-предел; мегабайтные строки не хэшируем

        if (isBlocked(email)) {
          await bcrypt.compare(password, DUMMY_HASH); // единое время ответа
          return null;
        }

        const { rows } = await db.query(
          `SELECT id, email, name, role, password_hash, status, pw_changed_at
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
        return {
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          pwt: u.pw_changed_at ? new Date(u.pw_changed_at).getTime() : 0,
        };
      },
    }),
  ],
});
