// Server component: reads the session via the DAL and renders sign-in/out
// forms whose actions set the cookie. Rendered inside Suspense in the root
// layout so this per-request read is a dynamic hole in an otherwise static
// shell.
import { signInAs, signOut } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";

const DEMO_USERS = [
  { id: "u1", name: "Alice" },
  { id: "u2", name: "Bob" },
];

export async function UserMenu() {
  const user = await getCurrentUser();
  return (
    <span>
      {user ? `Signed in as ${user.name}` : "Signed out"}
      {DEMO_USERS.filter((u) => u.id !== user?.id).map((u) => (
        <form key={u.id} action={signInAs.bind(null, u.id)}>
          <button>Sign in as {u.name}</button>
        </form>
      ))}
      {user && (
        <form action={signOut}>
          <button>Sign out</button>
        </form>
      )}
    </span>
  );
}
