// Runs in the "seam" vitest project: "#api/client" resolves to the typed
// mock module instead of the real data layer. Use this style of test when
// the upstream protocol can't be intercepted at the network boundary
// (gRPC, vendor SDKs) — when it's plain HTTP, prefer MSW (see the other
// test files).
//
// Also demonstrates testing a simple async Server Component by awaiting it.
// This only works for components that don't use framework request APIs —
// the Next docs still recommend e2e for anything beyond that.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RestockPanel } from "@/components/restock-panel";
// Import the mock by its direct path: in this project "#api/client" resolves
// to the same file, so this is the same module instance the component sees —
// and TypeScript gets the vi.fn types (via "#api/client" it would type
// against the real module).
import { getRestockStatus } from "@/tests/mocks/api-client.mock";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const params = Promise.resolve({ id: "p3" });

describe("RestockPanel (module seam)", () => {
  it("offers the restock button when no request exists", async () => {
    getRestockStatus.mockResolvedValueOnce(null);
    render(await RestockPanel({ params }));
    expect(
      screen.getByRole("button", { name: "Request restock" }),
    ).toBeInTheDocument();
  });

  it("shows pending state while the job runs", async () => {
    getRestockStatus.mockResolvedValueOnce({ status: "pending" });
    render(await RestockPanel({ params }));
    expect(screen.getByRole("status")).toHaveTextContent("Restock pending…");
  });

  it("shows confirmation once the job completes", async () => {
    getRestockStatus.mockResolvedValueOnce({ status: "confirmed" });
    render(await RestockPanel({ params }));
    expect(screen.getByRole("status")).toHaveTextContent("Restock confirmed.");
  });
});
