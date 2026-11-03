import { z } from "zod";

/**
 * An expected problem whose message can be shown to the user as-is,
 * e.g. "Only 3 available". Throw it inside a transaction to roll it back.
 */
export class UserError extends Error {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "UserError";
  }
}

/** Validate input with zod; throws a UserError with per-field messages on failure. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "form";
    fieldErrors[key] ??= issue.message;
  }
  const first = Object.values(fieldErrors)[0];
  throw new UserError(first ?? "Please check the form.", fieldErrors);
}

/** True for a Postgres unique-constraint violation (Prisma error P2002). */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
