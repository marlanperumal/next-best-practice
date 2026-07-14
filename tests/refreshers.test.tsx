// next/navigation's router only exists inside the Next runtime — a framework
// boundary, mocked like next/cache.
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PendingAutoRefresher,
  VisibilityRefetcher,
} from "@/components/refreshers";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("refreshers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("VisibilityRefetcher refreshes when the tab becomes visible", () => {
    render(<VisibilityRefetcher />);
    expect(refresh).not.toHaveBeenCalled();

    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("PendingAutoRefresher polls on an interval and stops at the cap", () => {
    render(<PendingAutoRefresher intervalMs={1000} maxAttempts={3} />);

    vi.advanceTimersByTime(10_000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("PendingAutoRefresher stops polling on unmount", () => {
    const { unmount } = render(<PendingAutoRefresher intervalMs={1000} />);
    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);

    unmount();
    vi.advanceTimersByTime(5000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
