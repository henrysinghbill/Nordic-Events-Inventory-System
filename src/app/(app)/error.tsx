"use client";

import { AlertIcon } from "@/components/icons";
import { Button, Card } from "@/components/ui";

/** Shown when a page fails to load (e.g. lost connection or a server problem). */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="mx-auto mt-8 max-w-md p-6 text-center">
      <AlertIcon className="mx-auto text-red-600" size={40} />
      <h1 className="mt-3 text-xl font-bold">This page couldn&apos;t be loaded</h1>
      <p className="mt-2 text-gray-700">
        The connection may have dropped, or something went wrong on the server. Nothing you saved earlier is affected.
      </p>
      <Button className="mt-4 w-full" onClick={() => reset()}>
        Try again
      </Button>
    </Card>
  );
}
