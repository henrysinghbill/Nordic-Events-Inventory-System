import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/login/actions";
import { ChevronRightIcon } from "@/components/icons";
import { Button, Card, PageHeader, SectionTitle } from "@/components/ui";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "More" };

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex min-h-14 items-center justify-between px-4 font-medium active:bg-gray-50">
        {children}
        <ChevronRightIcon className="text-gray-400" />
      </Link>
    </li>
  );
}

export default async function MenuPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader
        title="More"
        subtitle={`Signed in as ${user.displayName} (${user.username}) · ${user.role === "ADMIN" ? "Administrator" : "Member"}`}
      />
      <Card>
        <ul className="divide-y divide-gray-100">
          <MenuLink href="/search">Search items</MenuLink>
          <MenuLink href="/items/bulk">Bulk entry (best on a computer)</MenuLink>
          <MenuLink href="/search?missingPhoto=1">Items without a photo</MenuLink>
          <MenuLink href="/locations">Locations</MenuLink>
        </ul>
      </Card>

      {user.role === "ADMIN" && (
        <>
          <SectionTitle>Administration</SectionTitle>
          <Card>
            <ul className="divide-y divide-gray-100">
              <MenuLink href="/admin/companies">Companies</MenuLink>
              <MenuLink href="/admin/locations">Locations</MenuLink>
              <MenuLink href="/admin/users">Users</MenuLink>
            </ul>
          </Card>
        </>
      )}

      <form action={logoutAction} className="mt-6">
        <Button type="submit" variant="secondary" className="w-full">
          Sign out
        </Button>
      </form>
    </>
  );
}
