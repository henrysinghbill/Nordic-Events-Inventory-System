import type { Metadata } from "next";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { authProvider } from "@/server/auth/provider";
import { requireAdmin } from "@/server/auth/session";
import { fmtDateTime } from "@/server/dates";
import { db } from "@/server/db";
import { CreateUser, UserRow } from "./users-client";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requireAdmin();
  const { managesPasswords } = authProvider();
  const users = await db.user.findMany({ orderBy: [{ active: "desc" }, { displayName: "asc" }] });

  return (
    <>
      <PageHeader
        back={{ href: "/menu", label: "More" }}
        title="Users"
        subtitle={
          managesPasswords
            ? "Accounts and passwords are stored in this app (local sign-in)."
            : "People sign in with their VMS username and password. They appear here after their first sign-in, as members."
        }
      />
      {managesPasswords && <CreateUser />}
      <SectionTitle>All users</SectionTitle>
      <Card className="max-w-3xl">
        <ul className="divide-y divide-gray-100">
          {users.map((u) => (
            <li key={u.id}>
              <UserRow
                managesPasswords={managesPasswords}
                user={{
                  id: u.id,
                  username: u.username,
                  displayName: u.displayName,
                  role: u.role,
                  active: u.active,
                  lastLogin: u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : null,
                  isMe: u.id === me.id,
                }}
              />
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
