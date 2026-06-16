import { redirect } from "next/navigation";
import { getSession } from "@/app/lib/session";
import AppShell from "@/app/ui/layout/app-shell";

/**
 * Dashboard layout — wraps every route under /dashboard/*.
 *
 * Double-checks the session server-side as a defense-in-depth measure,
 * even though the proxy middleware already guards these routes.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await getSession();

  if (!token) {
    redirect("/login");
  }

  return <AppShell>{children}</AppShell>;
}
