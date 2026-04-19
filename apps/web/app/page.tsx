import { redirect } from "next/navigation";

/**
 * Root route is the dashboard once the (dashboard) route group is mounted
 * in Task 7. Until then, bounce users to /login so the app never lands on
 * an empty root. The (dashboard)/layout.tsx will eventually guard against
 * unauthenticated access and redirect back to /login itself.
 */
export default function RootPage(): never {
  redirect("/login");
}
