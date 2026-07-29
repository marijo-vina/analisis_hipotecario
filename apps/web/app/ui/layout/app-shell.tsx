import Sidebar from "@/app/ui/layout/sidebar";

interface AppShellProps {
  children: React.ReactNode;
}

/**
 * Server component — wraps all /dashboard/* routes.
 *
 * Composes the fixed Sidebar + scrollable content area with institutional warm background.
 */
export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-gf-bg">
      <Sidebar />

      <div className="flex-1 flex flex-col ml-sidebar">
        <main className="flex-1 p-content">{children}</main>
      </div>
    </div>
  );
}
