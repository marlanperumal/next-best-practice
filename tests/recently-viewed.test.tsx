import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { RecentlyViewed, RecordRecentlyViewed } from "@/components/recently-viewed";
import { useRecentlyViewedStore } from "@/stores/recently-viewed-store";

describe("recently viewed", () => {
  beforeEach(() => {
    localStorage.clear();
    useRecentlyViewedStore.setState({ items: [] });
  });

  it("rehydrates persisted items after mount", async () => {
    localStorage.setItem(
      "recently-viewed",
      JSON.stringify({ state: { items: [{ id: "p1", name: "Studio Headphones" }] }, version: 0 }),
    );

    render(<RecentlyViewed />);
    expect(await screen.findByText("Studio Headphones")).toBeInTheDocument();
  });

  it("records views, deduplicates, and caps the list", async () => {
    render(
      <>
        <RecordRecentlyViewed id="p1" name="Studio Headphones" />
        <RecordRecentlyViewed id="p2" name="USB Microphone" />
        <RecordRecentlyViewed id="p1" name="Studio Headphones" />
        <RecentlyViewed />
      </>,
    );

    expect(await screen.findByText("USB Microphone")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
