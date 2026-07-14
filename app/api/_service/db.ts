// In-memory backing store for the simulated external service. Everything under
// app/api plays the role of a third-party API: the app only talks to it over
// HTTP, never by importing this module.
import type { Product, Review, User } from "@/lib/api/schemas";

const LATENCY_MS = 400;

export const delay = () => new Promise((r) => setTimeout(r, LATENCY_MS));

// Request counters per endpoint family, exposed at /api/stats so cache hits
// and request-level dedup are observable from the outside.
export const hits: Record<string, number> = {};
export const track = (key: string) => {
  hits[key] = (hits[key] ?? 0) + 1;
};

export const users: User[] = [
  { id: "u1", name: "Alice" },
  { id: "u2", name: "Bob" },
];

export const favoriteIds: Record<string, string[]> = {
  u1: ["p2", "p7"],
  u2: [],
};

export const products: Product[] = [
  { id: "p1", name: "Studio Headphones", category: "audio", price: 199, description: "Closed-back reference headphones." },
  { id: "p2", name: "USB Microphone", category: "audio", price: 129, description: "Cardioid condenser mic." },
  { id: "p3", name: "Bookshelf Speakers", category: "audio", price: 349, description: "Passive two-way speakers." },
  { id: "p4", name: "Audio Interface", category: "audio", price: 179, description: "2-in/2-out USB-C interface." },
  { id: "p5", name: "4K Projector", category: "video", price: 1499, description: "Short-throw laser projector." },
  { id: "p6", name: "Capture Card", category: "video", price: 159, description: "HDMI capture at 4K60." },
  { id: "p7", name: "Mirrorless Camera", category: "video", price: 999, description: "APS-C body with kit lens." },
  { id: "p8", name: "Ring Light", category: "video", price: 49, description: "18-inch bi-color ring light." },
  { id: "p9", name: "Mechanical Keyboard", category: "gaming", price: 149, description: "Hot-swappable 75% board." },
  { id: "p10", name: "Gaming Mouse", category: "gaming", price: 79, description: "Lightweight wireless mouse." },
  { id: "p11", name: "Racing Wheel", category: "gaming", price: 299, description: "Force-feedback wheel and pedals." },
  { id: "p12", name: "Console Controller", category: "gaming", price: 69, description: "Pro controller with back paddles." },
];

export const reviews: Review[] = [
  { id: "r1", productId: "p1", author: "Ana", rating: 5, body: "Flat response, great for mixing.", helpful: 2 },
  { id: "r2", productId: "p1", author: "Ben", rating: 4, body: "Comfortable for long sessions.", helpful: 0 },
  { id: "r3", productId: "p2", author: "Cleo", rating: 4, body: "Clear vocals, some desk noise.", helpful: 1 },
  { id: "r4", productId: "p5", author: "Dev", rating: 5, body: "Stunning picture in a small room.", helpful: 0 },
  { id: "r5", productId: "p7", author: "Ana", rating: 3, body: "Good stills, average battery.", helpful: 0 },
  { id: "r6", productId: "p9", author: "Eli", rating: 5, body: "Thock. That is the review.", helpful: 3 },
  { id: "r7", productId: "p9", author: "Fay", rating: 4, body: "Stabilizers needed tuning.", helpful: 0 },
  { id: "r8", productId: "p10", author: "Gus", rating: 4, body: "Battery lasts about a week.", helpful: 0 },
];

let reviewSeq = 100;
export const nextReviewId = () => `r${reviewSeq++}`;

// Restock requests simulate slow background work on the external service:
// a request starts "pending" and self-completes a few seconds later.
export const restocks: Record<string, { status: "pending" | "confirmed" }> = {};

export function startRestock(productId: string) {
  const restock = { status: "pending" as const };
  restocks[productId] = restock;
  setTimeout(() => {
    restocks[productId] = { status: "confirmed" };
  }, 3000);
  return restock;
}
