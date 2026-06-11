import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/lib/db";

import { ProfileForms } from "./profile-forms";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { rows } = await db.query(
    "SELECT name, email, role FROM nexus_admin.users WHERE id = $1",
    [session.user.id]
  );
  const u = rows[0];
  if (!u) redirect("/login");

  return <ProfileForms name={u.name ?? ""} email={u.email} role={u.role} />;
}
