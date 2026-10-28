import Link from "next/link";
import { notFound } from "next/navigation";
import { SHOPS, getShop } from "@/lib/shops";

export const generateStaticParams = () => SHOPS.map((shop) => ({ shopId: shop.id }));

export default async function ShopPage({ params }: PageProps<"/shops/[shopId]">) {
  const shop = getShop((await params).shopId);
  if (!shop) notFound();

  return (
    <main className="w-full">
      <header className="px-4 py-8 text-white" style={{ background: shop.accent }}>
        <div className="mx-auto max-w-4xl">
          <h1 className="text-3xl font-bold">{shop.name}</h1>
          <p className="mt-1 opacity-90">{shop.tagline}</p>
          <p className="mt-2 text-sm opacity-80">
            Based in {shop.claimedCountry} · Seller rating {shop.claimedRating}/5
          </p>
        </div>
      </header>
      <ul className="mx-auto grid max-w-4xl gap-4 px-4 py-8 sm:grid-cols-2">
        {shop.products.map((product) => (
          <li key={product.id}>
            <Link
              href={`/shops/${shop.id}/${product.id}`}
              className="block rounded-xl border border-neutral-200 p-4 hover:border-neutral-400"
            >
              <span className="font-medium">{product.name}</span>
              <span className="mt-2 block text-lg font-semibold">€{product.price.toFixed(2)}</span>
              <span className="text-sm text-neutral-600">
                ★ {product.rating} ({product.reviews}) ·{" "}
                {product.advertisedShipping ? `+ €${product.advertisedShipping.toFixed(2)} shipping` : "Free shipping"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
