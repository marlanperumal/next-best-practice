import Link from "next/link";
import { notFound } from "next/navigation";
import { markHelpful } from "@/lib/actions";
import { getProduct, getReviews, getReviewSummary } from "@/lib/api";

// Previous-model ISR: this page is static HTML, regenerated in the
// background at most every 300s — or immediately when a tag it depends on
// is revalidated. No paths are built ahead of time (generateStaticParams
// returns []); each product's page is generated on first visit.
export const revalidate = 300;

export async function generateStaticParams() {
  return [];
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  const [reviews, summary] = await Promise.all([
    getReviews(id),
    getReviewSummary(id),
  ]);

  return (
    <article>
      <h1>{product.name}</h1>
      <p>
        ${product.price} — {product.description}
      </p>
      <h2>
        Reviews{" "}
        {summary.count > 0 && `(${summary.count}, avg ${summary.average?.toFixed(1)})`}
      </h2>
      {reviews.length === 0 ? (
        <p>No reviews yet.</p>
      ) : (
        <ul>
          {reviews.map((review) => (
            <li key={review.id}>
              {review.rating}/5 by {review.author}: {review.body}{" "}
              {/* No client components in this app: a plain form action.
                  The action's revalidateTag purges the Data Cache and this
                  ISR page, and the response shows the new count. */}
              <form action={markHelpful.bind(null, id, review.id)} style={{ display: "inline" }}>
                <button>Helpful ({review.helpful})</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link href="/products">← All products</Link>
      </p>
    </article>
  );
}
