import type { ReactNode } from "react";
import type { Document } from "@/app/lib/definitions";
import DataTable, { type Column } from "@/app/ui/common/data-table";
import StatusBadge from "@/app/ui/common/badge";
import DocumentActions from "./document-actions";

interface DocumentListProps {
  caseId: string;
  documents: Document[];
}

/**
 * Server component that renders the document table for a mortgage case
 * using the institutional DataTable and StatusBadge components.
 *
 * Columns: Tipo, Archivo, Estatus (StatusBadge), Fecha de carga, Acciones.
 * "Eliminar" button is only shown for documents in "Subido" (UPLOADED)
 * status — enforced by the DocumentActions client component.
 * Dates are formatted in Spanish locale (es-MX).
 */
export default function DocumentList({ caseId, documents }: DocumentListProps) {
  const columns: Column<Document>[] = [
    {
      key: "documentType",
      header: "Tipo",
      render: (doc: Document): ReactNode => doc.documentType.name,
    },
    {
      key: "originalName",
      header: "Archivo",
      render: (doc: Document): ReactNode => doc.originalName,
    },
    {
      key: "status",
      header: "Estatus",
      render: (doc: Document): ReactNode => (
        <StatusBadge
          code={doc.documentStatus.code}
          name={doc.documentStatus.name}
        />
      ),
    },
    {
      key: "createdAt",
      header: "Fecha de carga",
      render: (doc: Document): ReactNode =>
        new Date(doc.createdAt).toLocaleDateString("es-MX", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
    },
    {
      key: "actions",
      header: "Acciones",
      render: (doc: Document): ReactNode => (
        <DocumentActions caseId={caseId} document={doc} />
      ),
    },
  ];

  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold text-gf-text mb-4">
        Documentos
        {documents.length > 0 && (
          <span className="text-gf-text-muted font-normal ml-1">
            ({documents.length})
          </span>
        )}
      </h3>

      <DataTable
        columns={columns}
        rows={documents}
        emptyMessage="No hay documentos cargados"
      />
    </div>
  );
}
