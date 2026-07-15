import Link from "next/link";
import { getProducts } from "@/lib/api";

// Previous-model segment config: the ROUTE renders on every request, but the
// tagged fetch inside it is still served from the Data Cache. Route
// dynamism and response caching are independent axes in this model.
// (Segment configs like this are rejected under cacheComponents.)
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const products = await getProducts();
  return (
    <>
      <h1>Products</h1>
      <ul>
        {products.map((product) => (
          <li key={product.id}>
            <Link href={`/products/${product.id}`}>{product.name}</Link> ($
            {product.price})
          </li>
        ))}
      </ul>
    </>
  );
}
