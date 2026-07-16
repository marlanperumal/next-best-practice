import { http, HttpResponse, delay } from "msw";
import { setupServer } from "msw/node";

const API = "http://localhost:3000/api";

export const server = setupServer(
  http.get(`${API}/users/u1`, () =>
    HttpResponse.json({ id: "u1", name: "Alice" }),
  ),
  http.post(`${API}/users/u1/favorites`, async ({ request }) => {
    await delay(50);
    const body = (await request.json()) as {
      productId: string;
      favorite: boolean;
    };
    return HttpResponse.json(body);
  }),
  http.post(`${API}/products/p1/reviews`, async ({ request }) => {
    await delay(50);
    const body = (await request.json()) as {
      author: string;
      rating: number;
      body: string;
    };
    return HttpResponse.json(
      { id: "r100", productId: "p1", helpful: 0, ...body },
      { status: 201 },
    );
  }),
  http.post(`${API}/reviews/r1/helpful`, async () => {
    await delay(50);
    return HttpResponse.json({
      id: "r1",
      productId: "p1",
      author: "Ana",
      rating: 5,
      body: "Flat response, great for mixing.",
      helpful: 3,
    });
  }),
);
