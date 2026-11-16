/** Basic building blocks with consistent, thumb-friendly sizing. */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-600/50",
  secondary:
    "bg-white text-gray-900 border border-gray-300 hover:bg-gray-50 active:bg-gray-100 disabled:text-gray-400",
  danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-600/50",
  ghost: "text-brand-700 hover:bg-brand-50 active:bg-brand-100 disabled:text-gray-400",
};
const base =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 min-h-12 font-semibold transition-colors disabled:cursor-not-allowed select-none";

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type="button" className={cx(base, variants[variant], className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(base, variants[variant], className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-2xl bg-white shadow-sm ring-1 ring-black/5", className)} {...props} />;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-4">
      {back && (
        <Link href={back.href} className="mb-1 inline-block py-1 text-sm font-medium text-brand-700">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold break-words">{title}</h1>
          {subtitle && <div className="mt-0.5 text-gray-600">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mt-6 mb-2 flex items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">{children}</h2>
      {actions}
    </div>
  );
}

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "brand" | "amber" | "red" | "green" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-700",
    brand: "bg-brand-100 text-brand-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    green: "bg-green-100 text-green-800",
  };
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border-2 border-dashed border-gray-300 p-6 text-center text-gray-600">{children}</div>;
}

/** A pill-shaped choice (filters, type pickers): filled when it is the chosen one. */
export function chipClass(on: boolean) {
  return cx(
    "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 font-medium whitespace-nowrap transition-colors",
    on ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-white text-gray-800 active:bg-gray-100",
  );
}

export const inputClass =
  "block w-full rounded-xl border border-gray-300 bg-white px-3 min-h-12 text-base shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none disabled:bg-gray-100";
