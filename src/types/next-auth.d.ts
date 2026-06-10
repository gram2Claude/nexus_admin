import type { Role } from "@/lib/rbac";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
  interface User {
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: Role;
    /** ts последней перепроверки роли/статуса из БД (ревью 2.1) */
    chk?: number;
  }
}
