import type { Metadata } from "next";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { AddCompanyForm, CompanyRow } from "./companies-client";

export const metadata: Metadata = { title: "Companies" };

export default async function CompaniesPage() {
  await requireAdmin();
  const companies = await db.company.findMany({
    include: { _count: { select: { items: true } } },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
  });
  return (
    <>
      <PageHeader back={{ href: "/menu", label: "More" }} title="Companies" />
      <Card className="max-w-2xl p-4">
        <AddCompanyForm />
      </Card>
      <SectionTitle>All companies</SectionTitle>
      <Card className="max-w-2xl">
        <ul className="divide-y divide-gray-100">
          {companies.map((c) => (
            <li key={c.id}>
              <CompanyRow
                company={{ id: c.id, name: c.name, archived: Boolean(c.archivedAt), itemCount: c._count.items }}
              />
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
