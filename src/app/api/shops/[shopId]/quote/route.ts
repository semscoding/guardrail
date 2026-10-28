import { quote } from "@/lib/shops";

// GET /api/shops/:shopId/quote?product=match-balls-20&qty=1
// The shop's checkout: the real total, including fees the product page never showed.
export async function GET(request: Request, { params }: RouteContext<"/api/shops/[shopId]/quote">) {
  const { searchParams } = new URL(request.url);
  const result = quote(
    (await params).shopId,
    searchParams.get("product") ?? "",
    Number(searchParams.get("qty") ?? 1),
  );
  if (!result) return Response.json({ error: "unknown shop or product" }, { status: 404 });
  return Response.json(result);
}
