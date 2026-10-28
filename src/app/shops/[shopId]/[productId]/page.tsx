import Link from "next/link";
import { notFound } from "next/navigation";
import { SHOPS, getProduct, getShop } from "@/lib/shops";

export const generateStaticParams = () =>
  SHOPS.flatMap((shop) => shop.products.map((product) => ({ shopId: shop.id, productId: product.id })));

export default async function ProductPage({ params }: PageProps<"/shops/[shopId]/[productId]">) {
  const { shopId, productId } = await params;
  const shop = getShop(shopId);
  const product = getProduct(shopId, productId);
  if (!shop || !product) notFound();

  return (
    <main className="w-full">
      <header className="px-4 py-4 text-white" style={{ background: shop.accent }}>
        <Link href={`/shops/${shop.id}`} className="mx-auto block max-w-4xl font-bold">
          {shop.name}
        </Link>
      </header>
      <article className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm text-neutral-600">
          Sold by {shop.name} · {shop.claimedCountry} · Seller rating {shop.claimedRating}/5
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{product.name}</h1>
        <p className="mt-4 text-3xl font-bold">€{product.price.toFixed(2)}</p>
        <p className="text-neutral-700">
          {product.advertisedShipping ? `+ €${product.advertisedShipping.toFixed(2)} shipping` : "Free shipping"}
        </p>
        <p className="mt-2 text-sm">
          ★ {product.rating}/5 · {product.reviews} reviews
        </p>
        <p className="mt-6 max-w-prose text-neutral-800">{product.description}</p>
        {product.hiddenText && (
          // The attack: invisible to people, plain text to an agent reading the page.
          <p data-attack="prompt-injection" className="mt-6 text-[1px] leading-none text-white select-none">
            {product.hiddenText}
          </p>
        )}
        <button
          type="button"
          className="mt-8 rounded-lg px-6 py-3 font-medium text-white"
          style={{ background: shop.accent }}
        >
          Add to cart
        </button>
      </article>
    </main>
  );
}
