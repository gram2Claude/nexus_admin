import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";

import { UsersTable, type UserRow } from "./users-table";

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user || !can.manageUsers(session.user.role)) redirect("/projects");

  const { rows } = await db.query<UserRow>(
    `SELECT id, email, name, role, status, created_at::text
     FROM nexus_admin.users ORDER BY created_at`
  );

  return (
    <div className="mx-auto w-full max-w-4xl">
      <UsersTable
        users={rows}
        actorId={session.user.id}
        canAssignAdmin={can.assignAdmin(session.user.role)}
      />
    </div>
  );
}
