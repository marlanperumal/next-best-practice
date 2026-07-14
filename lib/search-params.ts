// Single source of truth for URL search param parsing, shared by client
// components (useQueryStates) and server components (createLoader).
import {
  createLoader,
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

export const tabs = ["details", "reviews"] as const;

export const productTabParams = {
  tab: parseAsStringLiteral(tabs).withDefault("details"),
};

export const loadProductTabParams = createLoader(productTabParams);
