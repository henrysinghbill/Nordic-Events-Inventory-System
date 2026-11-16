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
          <MenuLink href="/events">Events</MenuLink>
          <MenuLink href="/locations">Locations</MenuLink>
          <MenuLink href="/search">Search everything</MenuLink>
          <MenuLink href="/activity">Recent activity</MenuLink>
        </ul>
      </Card>
      <SectionTitle>Adding and tidying up</SectionTitle>
      <Card>
        <ul className="divide-y divide-gray-100">
          <MenuLink href="/items/new">Add item</MenuLink>
          <MenuLink href="/items/bulk">Bulk entry (best on a computer)</MenuLink>
          <MenuLink href="/items?missingPhoto=1">Items without a photo</MenuLink>
          <MenuLink href="/items/untyped">Items without a type</MenuLink>
        </ul>
      </Card>
      <Card className="mt-3">
        <a href="/api/export" download className="flex min-h-14 items-center justify-between px-4 font-medium active:bg-gray-50">
          <span>
            Download inventory (Excel)
            <span className="block text-sm font-normal text-gray-500">Everything as it is right now: items, where they are, boxes and events</span>
          </span>
          <ChevronRightIcon className="shrink-0 text-gray-400" />
        </a>
      </Card>

      {user.role === "ADMIN" && (
        <>
          <SectionTitle>Administration</SectionTitle>
          <Card>
            <ul className="divide-y divide-gray-100">
              <MenuLink href="/admin/companies">Companies</MenuLink>
              <MenuLink href="/admin/types">Item types</MenuLink>
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
