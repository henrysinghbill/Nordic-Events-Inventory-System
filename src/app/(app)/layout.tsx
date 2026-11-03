import Link from "next/link";
import { BoxIcon } from "@/components/icons";
import { BottomNav, TopNavLinks } from "@/components/nav";
import { requireUser } from "@/server/auth/session";

/** Shell for every signed-in page: top bar, content, bottom navigation on phones. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <>
      <header className="sticky top-0 z-30 bg-brand-600 text-white shadow" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <BoxIcon size={22} />
            <span>Events Inventory</span>
          </Link>
          <TopNavLinks />
          <Link href="/menu" className="truncate text-sm text-white/90 md:hidden">
            {user.displayName}
          </Link>
        </div>
      </header>
      <main className="pb-safe-nav mx-auto max-w-6xl px-4 pt-4">{children}</main>
      <BottomNav />
    </>
  );
}
