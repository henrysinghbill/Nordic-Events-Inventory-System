import type { Metadata } from "next";
import Link from "next/link";
import { CalendarIcon, ChevronRightIcon } from "@/components/icons";
import { Badge, Card, EmptyState, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { eventPhase, formatDayRange, PHASE_LABEL, PHASE_TONE, todayIn } from "@/lib/days";
import { plural } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { config } from "@/server/config";
import { eventsList } from "@/server/queries";

export const metadata: Metadata = { title: "Events" };

type Row = Awaited<ReturnType<typeof eventsList>>[number];

function EventRow({ e, today }: { e: Row; today: string }) {
  const phase = eventPhase(e, today);
  return (
    <li>
      <Link href={`/events/${e.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-gray-50">
        <CalendarIcon className="shrink-0 text-brand-600" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{e.name}</span>
            <Badge tone={PHASE_TONE[phase]}>{PHASE_LABEL[phase]}</Badge>
          </span>
          <span className="block text-sm text-gray-600">
            {e.venue.name} · {formatDayRange(e.startDate, e.endDate)}
          </span>
          {phase !== "wrapped" && (
            <span className="block text-sm text-gray-600">
              {e.lineCount ? `Packing list: ${e.linesDone} of ${e.lineCount} ready` : "No packing list yet"} ·{" "}
              {plural(e.boxCount, "box", "boxes")}
            </span>
          )}
        </span>
        <ChevronRightIcon className="shrink-0 text-gray-400" />
      </Link>
    </li>
  );
}

export default async function EventsPage() {
  await requireUser();
  const events = await eventsList();
  const today = todayIn(config().APP_TIMEZONE);
  const open = events.filter((e) => !e.wrappedUpAt);
  const done = events.filter((e) => e.wrappedUpAt).reverse();

  return (
    <>
      <PageHeader title="Events" actions={<LinkButton href="/events/new">+ New event</LinkButton>} />
      {open.length === 0 ? (
        <EmptyState>No upcoming events. Create one to plan its packing list and boxes.</EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-gray-100">
            {open.map((e) => (
              <EventRow key={e.id} e={e} today={today} />
            ))}
          </ul>
        </Card>
      )}
      {done.length > 0 && (
        <>
          <SectionTitle>Wrapped up</SectionTitle>
          <Card>
            <ul className="divide-y divide-gray-100">
              {done.map((e) => (
                <EventRow key={e.id} e={e} today={today} />
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
