import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto mt-16 max-w-md p-6 text-center">
      <h1 className="text-2xl font-bold">Not found</h1>
      <p className="mt-2 text-gray-700">That page doesn&apos;t exist, or what it showed has been removed.</p>
      <Link href="/" className="mt-4 inline-block font-semibold text-brand-700">
        Go to the home page
      </Link>
    </main>
  );
}
