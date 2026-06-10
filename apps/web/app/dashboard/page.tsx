import Link from "next/link";

/**
 * Dashboard home page — module summary cards.
 *
 * Server Component rendered inside the dashboard layout.
 */
export default function DashboardPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-6">
        Panel de control
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/dashboard/clientes"
          className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition"
        >
          <h3 className="text-lg font-semibold text-slate-900">Clientes</h3>
          <p className="text-slate-600 mt-1">
            Gestionar clientes y consultar expedientes vinculados
          </p>
        </Link>

        <Link
          href="/dashboard/expedientes"
          className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition"
        >
          <h3 className="text-lg font-semibold text-slate-900">Expedientes</h3>
          <p className="text-slate-600 mt-1">
            Crear y consultar expedientes hipotecarios
          </p>
        </Link>
      </div>
    </div>
  );
}
