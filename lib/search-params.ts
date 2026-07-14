// Single source of truth for URL search param parsing, shared by client
// components (useQueryStates) and server components (createLoader).
import {
  createLoader,
  createSerializer,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

export const categories = ["audio", "video", "gaming"] as const;

export const productListParams = {
  category: parseAsStringLiteral(categories),
  q: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
};

export const loadProductListParams = createLoader(productListParams);

// For building URLs server-side (e.g. the out-of-range page redirect);
// omits values that equal their defaults.
export const serializeProductListParams = createSerializer(productListParams);

export const tabs = ["details", "reviews"] as const;

export const productTabParams = {
  tab: parseAsStringLiteral(tabs).withDefault("details"),
};

export const loadProductTabParams = createLoader(productTabParams);
