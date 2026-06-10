import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { db } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? "")
          .toLowerCase()
          .trim();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;

        const { rows } = await db.query(
          `SELECT id, email, name, role, password_hash, status
           FROM nexus_admin.users WHERE email = $1`,
          [email]
        );
        const u = rows[0];
        if (!u || u.status !== "active" || !u.password_hash) return null;

        const ok = await bcrypt.compare(password, u.password_hash);
        if (!ok) return null;

        return { id: u.id, email: u.email, name: u.name, role: u.role };
      },
    }),
  ],
});
