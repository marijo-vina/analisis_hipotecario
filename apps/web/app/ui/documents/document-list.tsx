import type { Document } from "@/app/lib/definitions";

interface DocumentListProps {
  documents: Document[];
}

/** Status colour map — consistent with badges used elsewhere. */
const STATUS_COLORS: Record<string, string> = {
  UPLOADED: "bg-sky-50 text-sky-700 ring-sky-600/20",
  PENDING_REVIEW: "bg-amber-50 text-amber-700 ring-amber-600/20",
  VALIDATED: "bg-green-50 text-green-700 ring-green-600/20",
  REJECTED: "bg-red-50 text-red-700 ring-red-600/20",
};

const FALLBACK_COLOR = "bg-gray-50 text-gray-700 ring-gray-600/20";

/**
 * Server component that renders the document table for a mortgage case.
 * Shows document type, original filename, upload date, and status badge.
 *
 * NO download buttons, NO preview links, NO signed URLs (per HU-07 scope).
 */
export default function DocumentList({ documents }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Documentos
        </h3>
        <p className="text-sm text-slate-500">No hay documentos cargados.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">
        Documentos ({documents.length})
      </h3>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Nombre original</th>
              <th className="px-3 py-2">Fecha de carga</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {documents.map((doc) => (
              <tr key={doc.id} className="hover:bg-slate-50">
                <td className="px-3 py-2.5 text-slate-900">
                  {doc.documentType.name}
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  {doc.originalName}
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  {new Date(doc.createdAt).toLocaleDateString("es-MX", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      STATUS_COLORS[doc.documentStatus.code] ?? FALLBACK_COLOR
                    }`}
                  >
                    {doc.documentStatus.name}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
