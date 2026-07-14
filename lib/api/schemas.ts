import { z } from "zod";

export const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(["audio", "video", "gaming"]),
  price: z.number(),
  description: z.string(),
  favorite: z.boolean(),
});

export const productListSchema = z.object({
  items: z.array(productSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});

export const reviewSchema = z.object({
  id: z.string(),
  productId: z.string(),
  author: z.string(),
  rating: z.number().min(1).max(5),
  body: z.string(),
});

export const reviewListSchema = z.array(reviewSchema);

export type Product = z.infer<typeof productSchema>;
export type ProductList = z.infer<typeof productListSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Category = Product["category"];
