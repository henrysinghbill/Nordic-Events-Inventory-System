"use client";

import { Button } from "@/components/ui";

export function PrintButton() {
  return (
    <Button className="w-full sm:w-auto" onClick={() => window.print()}>
      Print
    </Button>
  );
}
