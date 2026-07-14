import { http, HttpResponse, delay } from "msw";
import { setupServer } from "msw/node";
import type { Product } from "@/lib/api/schemas";

const API = "http://localhost:3000/api";

export const seedProducts = (): Product[] => [
  { id: "p1", name: "Studio Headphones", category: "audio", price: 199, description: "Closed-back.", favorite: false },
  { id: "p2", name: "USB Microphone", category: "audio", price: 129, description: "Condenser mic.", favorite: true },
];

let products = seedProducts();

export function resetProducts() {
  products = seedProducts();
}

export const server = setupServer(
  http.patch(`${API}/products/:id`, async ({ params, request }) => {
    await delay(50);
    const product = products.find((p) => p.id === params.id);
    if (!product) return HttpResponse.json({ error: "Not found" }, { status: 404 });
    const body = (await request.json()) as { favorite: boolean };
    product.favorite = body.favorite;
    return HttpResponse.json(product);
  }),
);
