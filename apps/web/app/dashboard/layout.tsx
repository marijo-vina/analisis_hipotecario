import { redirect } from "next/navigation";
import { getSession } from "@/app/lib/session";
import Sidebar from "@/app/ui/sidebar";

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

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6 bg-slate-100 ml-64">
        {children}
      </main>
    </div>
  );
}
