// Module-seam mock for "#api/client", activated by the "mock" resolve
// condition (see the seam project in vitest.config.mts). Every export is
// annotated with the real module's type, so if the real contract changes
// this file fails to compile instead of silently drifting — the main risk
// of seam mocks. vi.fn() lets individual tests override per case.
import { vi } from "vitest";

type Client = typeof import("@/lib/api/client");

export const getProducts = vi.fn<Client["getProducts"]>(async () => ({
  items: [
    {
      id: "p1",
      name: "Studio Headphones",
      category: "audio",
      price: 199,
      description: "Closed-back.",
    },
  ],
  total: 1,
  page: 1,
  pageSize: 5,
}));

export const getProduct = vi.fn<Client["getProduct"]>(async () => ({
  id: "p1",
  name: "Studio Headphones",
  category: "audio",
  price: 199,
  description: "Closed-back.",
}));

export const getReviews = vi.fn<Client["getReviews"]>(async () => []);

export const getUser = vi.fn<Client["getUser"]>(async () => ({
  id: "u1",
  name: "Alice",
}));

export const getFavoriteIds = vi.fn<Client["getFavoriteIds"]>(async () => []);

export const getRestockStatus = vi.fn<Client["getRestockStatus"]>(
  async () => null,
);

export const postFavorite = vi.fn<Client["postFavorite"]>();
export const postReview = vi.fn<Client["postReview"]>();
export const postReviewHelpful = vi.fn<Client["postReviewHelpful"]>();
export const postRestockRequest = vi.fn<Client["postRestockRequest"]>();
