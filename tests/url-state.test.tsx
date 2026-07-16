// URL-state components tested against the nuqs testing adapter: assertions
// are on the URL updates the component emits, not on internals.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  withNuqsTestingAdapter,
  type UrlUpdateEvent,
} from "nuqs/adapters/testing";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "@/components/pagination";
import { ProductFilters } from "@/components/product-filters";
import { ProductTabs } from "@/components/product-tabs";

describe("ProductFilters", () => {
  it("sets the category and resets the page", async () => {
    const onUrlUpdate = vi.fn<(e: UrlUpdateEvent) => void>();
    const user = userEvent.setup();
    render(<ProductFilters />, {
      wrapper: withNuqsTestingAdapter({ searchParams: "?page=3", onUrlUpdate }),
    });

    await user.selectOptions(screen.getByRole("combobox"), "video");

    const [event] = onUrlUpdate.mock.lastCall!;
    expect(event.searchParams.get("category")).toBe("video");
    expect(event.searchParams.get("page")).toBeNull();
  });

  it("debounces search input", async () => {
    const onUrlUpdate = vi.fn<(e: UrlUpdateEvent) => void>();
    const user = userEvent.setup();
    render(<ProductFilters />, {
      wrapper: withNuqsTestingAdapter({ searchParams: "", onUrlUpdate }),
    });

    await user.type(screen.getByRole("searchbox"), "mic");
    expect(onUrlUpdate).not.toHaveBeenCalled();

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalledTimes(1));
    const [event] = onUrlUpdate.mock.lastCall!;
    expect(event.searchParams.get("q")).toBe("mic");
  });
});

describe("ProductTabs", () => {
  it("switches the active tab via the URL", async () => {
    const onUrlUpdate = vi.fn<(e: UrlUpdateEvent) => void>();
    const user = userEvent.setup();
    render(<ProductTabs />, {
      wrapper: withNuqsTestingAdapter({ searchParams: "", onUrlUpdate }),
    });

    expect(screen.getByRole("tab", { name: "details" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(screen.getByRole("tab", { name: "reviews" }));

    const [event] = onUrlUpdate.mock.lastCall!;
    expect(event.searchParams.get("tab")).toBe("reviews");
  });
});

describe("Pagination", () => {
  it("navigates pages and disables buttons at the edges", async () => {
    const onUrlUpdate = vi.fn<(e: UrlUpdateEvent) => void>();
    const user = userEvent.setup();
    render(<Pagination totalPages={3} />, {
      wrapper: withNuqsTestingAdapter({ searchParams: "?page=3", onUrlUpdate }),
    });

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Previous" }));

    const [event] = onUrlUpdate.mock.lastCall!;
    expect(event.searchParams.get("page")).toBe("2");
  });
});
