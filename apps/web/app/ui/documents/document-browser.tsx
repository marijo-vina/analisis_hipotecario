"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Document, DocumentType } from "@/app/lib/definitions";
import Button from "@/app/ui/common/button";
import DocumentCardGrid from "@/app/ui/documents/document-card-grid";
import DocumentUpload from "@/app/ui/documents/document-upload";

// ---------------------------------------------------------------------------
// Category definitions
//
// Categories group document types by `code`. All categories are always shown
// in the left list (even with 0 documents), in a fixed display order.
// ---------------------------------------------------------------------------

interface CategoryDef {
  key: string;
  label: string;
  /** DocumentType.code values that belong to this category. */
  codes: string[];
}

const CATEGORIES: CategoryDef[] = [
  { key: "identificacion", label: "Identificación", codes: ["INE", "PASSPORT"] },
  { key: "nomina", label: "Nómina", codes: ["PAYROLL_RECEIPT"] },
  { key: "estados-cuenta", label: "Estados de cuenta", codes: ["BANK_STATEMENT"] },
  { key: "buro", label: "Buró", codes: ["CREDIT_BUREAU"] },
];

interface DocumentBrowserProps {
  caseId: string;
  documents: Document[];
  documentTypes: DocumentType[];
}

/**
 * DocumentBrowser — two-column layout for a case's documentation section.
 *
 * Left column (desktop ~240px): clickable category list with a circular
 * count badge per category. The active category is highlighted.
 *
 * Right column: header (selected category title + "Agregar documento"
 * button) followed by a compact grid of the documents in the selected
 * category. Reuses the existing `DocumentCardGrid` for the cards.
 *
 * On screens below 640px the category list collapses into a horizontal
 * pill row above the document grid (functional, not advanced mobile).
 *
 * "Agregar documento" opens a centered modal that wraps the existing
 * `DocumentUpload`. When a category is selected the document type is
 * pre-selected to the first matching type of that category (additive
 * `defaultDocumentTypeId` prop). A successful upload closes the modal
 * and refreshes the route so the new document appears.
 */
export default function DocumentBrowser({
  caseId,
  documents,
  documentTypes,
}: DocumentBrowserProps) {
  const router = useRouter();

  // ── Category → documents map (memoized on documents) ──────────────────
  const categoryData = useMemo(() => {
    return CATEGORIES.map((cat) => {
      const docs = documents.filter((d) => cat.codes.includes(d.documentType.code));
      return { ...cat, documents: docs, count: docs.length };
    });
  }, [documents]);

  // ── Initial selection: first category with documents, else Identificación
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string>(() => {
    const firstWithDocs = categoryData.find((c) => c.count > 0);
    return firstWithDocs ? firstWithDocs.key : CATEGORIES[0].key;
  });

  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const selectedCategory =
    categoryData.find((c) => c.key === selectedCategoryKey) ?? categoryData[0];

  // ── Pre-selected document type for the upload modal ────────────────────
  // First documentType whose code matches the active category, if any.
  const preselectedDocumentTypeId = useMemo(() => {
    if (!selectedCategory) return undefined;
    const match = documentTypes.find((dt) =>
      selectedCategory.codes.includes(dt.code),
    );
    return match ? String(match.id) : undefined;
  }, [selectedCategory, documentTypes]);

  // ── Upload success: close modal + refresh so the new doc appears ──────
  const handleUploadSuccess = () => {
    setUploadModalOpen(false);
    router.refresh();
  };

  const handleUploadClose = () => setUploadModalOpen(false);

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      {/* ── Left column: category list (desktop) / pills (mobile) ─────── */}
      <nav
        aria-label="Categorías de documentos"
        className="
          sm:w-60 sm:shrink-0
          flex sm:flex-col gap-2 sm:gap-1
          overflow-x-auto sm:overflow-visible
          pb-2 sm:pb-0
        "
      >
        {categoryData.map((cat) => {
          const active = cat.key === selectedCategoryKey;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => setSelectedCategoryKey(cat.key)}
              aria-current={active ? "true" : undefined}
              className={`
                shrink-0 sm:w-full
                flex items-center justify-between gap-3
                rounded-[var(--radius-sm)] border
                px-3 py-2 text-sm text-left
                transition-colors
                ${
                  active
                    ? "bg-gf-red-soft/60 border-gf-red text-gf-text border-l-4"
                    : "bg-gf-surface border-gf-border border-l-4 border-l-transparent text-gf-text hover:bg-gf-bg"
                }
              `}
            >
              <span className="font-medium whitespace-nowrap sm:whitespace-normal">
                {cat.label}
              </span>
              <span
                aria-label={`${cat.count} documento${cat.count === 1 ? "" : "s"}`}
                className={`
                  inline-flex items-center justify-center
                  min-w-[1.5rem] h-6 px-1.5 rounded-full text-xs font-semibold
                  ${
                    active
                      ? "bg-gf-red text-white"
                      : "bg-gf-bg text-gf-text-muted"
                  }
                `}
              >
                {cat.count}
              </span>
            </button>
          );
        })}
      </nav>

      {/* ── Right column: header + document grid ─────────────────────── */}
      <section className="flex-1 min-w-0">
        <header className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-base font-semibold text-gf-text">
            {selectedCategory?.label}
          </h3>
          <Button
            variant="primary"
            onClick={() => setUploadModalOpen(true)}
            type="button"
          >
            + Agregar documento
          </Button>
        </header>

        {selectedCategory && selectedCategory.documents.length > 0 ? (
          <DocumentCardGrid caseId={caseId} documents={selectedCategory.documents} />
        ) : (
          <div className="rounded-[var(--radius-md)] border border-dashed border-gf-border bg-gf-bg/30 p-8 text-center">
            <p className="text-sm text-gf-text-muted">
              No hay documentos de este tipo. Usa el botón{" "}
              <span className="font-medium text-gf-text">Agregar documento</span>{" "}
              para subir uno.
            </p>
          </div>
        )}
      </section>

      {/* ── Upload modal ──────────────────────────────────────────────── */}
      {uploadModalOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={handleUploadClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="upload-dialog-title"
        >
          <div
            className="w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Shell header — DocumentUpload renders its own Card body */}
            <div className="flex items-center justify-between mb-3 px-1">
              <h2
                id="upload-dialog-title"
                className="text-lg font-semibold text-gf-text"
              >
                Agregar documento
              </h2>
              <button
                type="button"
                onClick={handleUploadClose}
                aria-label="Cerrar"
                className="text-gf-text-muted hover:text-gf-text text-2xl leading-none px-2"
              >
                &times;
              </button>
            </div>

            <DocumentUpload
              caseId={caseId}
              documentTypes={documentTypes}
              onSuccess={handleUploadSuccess}
              defaultDocumentTypeId={preselectedDocumentTypeId}
            />
          </div>
        </div>
      )}
    </div>
  );
}