import { PendingAutoRefresher } from "@/components/refreshers";
import { RestockButton } from "@/components/restock-button";
import { getCurrentUser } from "@/lib/auth";
import { getRestockStatus } from "#api/client";

// The background-job pattern: the server renders the job's current state,
// and only while it is pending renders a capped poller. Polling starts and
// stops entirely as a function of server state. Restock requests are
// per-user, so the panel only exists for a session.
export async function RestockPanel({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return null;
  const restock = await getRestockStatus(id, user.id);
  if (!restock) {
    return (
      <p>
        <RestockButton productId={id} />
      </p>
    );
  }
  if (restock.status === "pending") {
    return (
      <p role="status">
        Restock pending… <PendingAutoRefresher />
      </p>
    );
  }
  return <p role="status">Restock confirmed.</p>;
}
