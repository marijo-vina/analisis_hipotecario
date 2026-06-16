import Sidebar from "@/app/ui/layout/sidebar";
import Topbar from "@/app/ui/layout/topbar";

interface AppShellProps {
  children: React.ReactNode;
  /** Optional session data — reserved for future use (e.g. user name in Topbar). */
  session?: { name?: string; email?: string };
}

/**
 * Server component — wraps all /dashboard/* routes.
 *
 * Composes the fixed Sidebar + sticky Topbar + scrollable content area
 * with the institutional warm background (#FFF7F7) and 32px padding.
 */
export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-gf-bg">
      <Sidebar />

      <div className="flex-1 flex flex-col ml-sidebar">
        <Topbar />

        <main className="flex-1 p-content">{children}</main>
      </div>
    </div>
  );
}
