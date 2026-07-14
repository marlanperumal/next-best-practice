// In-memory backing store for the simulated external service. Everything under
// app/api plays the role of a third-party API: the app only talks to it over
// HTTP, never by importing this module.
import type { Product, Review } from "@/lib/api/schemas";

const LATENCY_MS = 400;

export const delay = () => new Promise((r) => setTimeout(r, LATENCY_MS));

export const products: Product[] = [
  { id: "p1", name: "Studio Headphones", category: "audio", price: 199, description: "Closed-back reference headphones.", favorite: false },
  { id: "p2", name: "USB Microphone", category: "audio", price: 129, description: "Cardioid condenser mic.", favorite: true },
  { id: "p3", name: "Bookshelf Speakers", category: "audio", price: 349, description: "Passive two-way speakers.", favorite: false },
  { id: "p4", name: "Audio Interface", category: "audio", price: 179, description: "2-in/2-out USB-C interface.", favorite: false },
  { id: "p5", name: "4K Projector", category: "video", price: 1499, description: "Short-throw laser projector.", favorite: false },
  { id: "p6", name: "Capture Card", category: "video", price: 159, description: "HDMI capture at 4K60.", favorite: false },
  { id: "p7", name: "Mirrorless Camera", category: "video", price: 999, description: "APS-C body with kit lens.", favorite: true },
  { id: "p8", name: "Ring Light", category: "video", price: 49, description: "18-inch bi-color ring light.", favorite: false },
  { id: "p9", name: "Mechanical Keyboard", category: "gaming", price: 149, description: "Hot-swappable 75% board.", favorite: false },
  { id: "p10", name: "Gaming Mouse", category: "gaming", price: 79, description: "Lightweight wireless mouse.", favorite: false },
  { id: "p11", name: "Racing Wheel", category: "gaming", price: 299, description: "Force-feedback wheel and pedals.", favorite: false },
  { id: "p12", name: "Console Controller", category: "gaming", price: 69, description: "Pro controller with back paddles.", favorite: false },
];

export const reviews: Review[] = [
  { id: "r1", productId: "p1", author: "Ana", rating: 5, body: "Flat response, great for mixing." },
  { id: "r2", productId: "p1", author: "Ben", rating: 4, body: "Comfortable for long sessions." },
  { id: "r3", productId: "p2", author: "Cleo", rating: 4, body: "Clear vocals, some desk noise." },
  { id: "r4", productId: "p5", author: "Dev", rating: 5, body: "Stunning picture in a small room." },
  { id: "r5", productId: "p7", author: "Ana", rating: 3, body: "Good stills, average battery." },
  { id: "r6", productId: "p9", author: "Eli", rating: 5, body: "Thock. That is the review." },
  { id: "r7", productId: "p9", author: "Fay", rating: 4, body: "Stabilizers needed tuning." },
  { id: "r8", productId: "p10", author: "Gus", rating: 4, body: "Battery lasts about a week." },
];
