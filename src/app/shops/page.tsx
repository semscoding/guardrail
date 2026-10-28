import Link from "next/link";
import { SHOPS } from "@/lib/shops";

export const metadata = { title: "Demo shops · GUARDRAIL" };

export default function ShopsIndex() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Demo shops</h1>
      <p className="mt-1 text-neutral-600">Staged shops the agent can buy from. One of them is malicious.</p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        {SHOPS.map((shop) => (
          <li key={shop.id}>
            <Link
              href={`/shops/${shop.id}`}
              className="block rounded-xl border border-neutral-200 p-4 hover:border-neutral-400"
              style={{ borderTop: `4px solid ${shop.accent}` }}
            >
              <span className="font-medium">{shop.name}</span>
              <span className="mt-1 block text-sm text-neutral-600">{shop.tagline}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
