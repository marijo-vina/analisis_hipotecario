"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Plus,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  RotateCw,
  X,
  FileSpreadsheet,
} from "lucide-react";
import type { Document, DocumentType } from "@/app/lib/definitions";
import {
  getDocumentCategories,
  type DocumentCategory,
} from "@/app/lib/required-documents";
import StatusBadge from "@/app/ui/common/badge";
import DocumentActions from "@/app/ui/documents/document-actions";
import DocumentUpload from "@/app/ui/documents/document-upload";
import BankStatementBatchActions from "@/app/ui/documents/bank-statement-batch-actions";

function categoryDisplayLabel(cat: DocumentCategory): string {
  if (cat.owner === "SHAREHOLDER") return `Accionista · ${cat.label}`;
  if (cat.owner === "COMPANY") return `Empresa · ${cat.label}`;
  return cat.label;
}

function matchesCategory(doc: Document, cat: DocumentCategory): boolean {
  if (!cat.codes.includes(doc.documentType.code)) return false;
  if (!cat.owner) return true;
  return (doc.owner ?? "SHAREHOLDER") === cat.owner;
}

interface DocumentBrowserProps {
  caseId: string;
  documents: Document[];
  documentTypes: DocumentType[];
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  personType?: string;
}

export default function DocumentBrowser({
  caseId,
  documents,
  documentTypes,
  isCollapsed = false,
  onToggleCollapse,
  personType,
}: DocumentBrowserProps) {
  const router = useRouter();

  const categories = useMemo(
    () => getDocumentCategories(personType),
    [personType],
  );

  // Category -> documents map
  const categoryData = useMemo(() => {
    return categories.map((cat) => {
      const docs = documents.filter((d) => matchesCategory(d, cat));
      return { ...cat, documents: docs, count: docs.length };
    });
  }, [documents, categories]);

  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string>(() => {
    const firstWithDocs = categoryData.find((c) => c.count > 0);
    return firstWithDocs ? firstWithDocs.key : categories[0].key;
  });

  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const selectedCategory =
    categoryData.find((c) => c.key === selectedCategoryKey) ?? categoryData[0];

  const preselectedDocumentTypeId = useMemo(() => {
    if (!selectedCategory) return undefined;
    const match = documentTypes.find((dt) =>
      selectedCategory.codes.includes(dt.code),
    );
    return match ? String(match.id) : undefined;
  }, [selectedCategory, documentTypes]);

  const handleUploadSuccess = () => {
    setUploadModalOpen(false);
    router.refresh();
  };

  const handleUploadClose = () => setUploadModalOpen(false);

  // If sidebar is in collapsed state (60px)
  if (isCollapsed) {
    return (
      <aside className="w-16 bg-white border-r border-gf-border flex flex-col items-center py-6 shrink-0 rounded-xl transition-all shadow-xs">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-2 rounded-xl text-gf-text-muted hover:text-gf-red hover:bg-gf-surface-dim transition-colors mb-6"
          title="Expandir barra de documentos"
        >
          <ChevronsRight className="w-5 h-5" strokeWidth={2} />
        </button>

        <div className="flex flex-col gap-4 items-center flex-1">
          {categoryData.map((cat) => {
            const active = cat.key === selectedCategoryKey;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => {
                  setSelectedCategoryKey(cat.key);
                  if (onToggleCollapse) onToggleCollapse();
                }}
                className={`relative p-2.5 rounded-xl transition-all ${
                  active
                    ? "bg-gf-red text-white shadow-2xs"
                    : "bg-gf-surface-dim/50 text-gf-text-muted hover:bg-gf-surface-dim hover:text-gf-text"
                }`}
                title={`${categoryDisplayLabel(cat)} (${cat.count})`}
              >
                <FileText className="w-4 h-4" />
                {cat.count > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-gf-red-soft text-gf-red text-[10px] font-bold rounded-full flex items-center justify-center border border-white">
                    {cat.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  // Expanded Sidebar Layout (320px)
  return (
    <aside className="w-full xl:w-[320px] bg-white border border-gf-border rounded-xl p-5 flex flex-col shrink-0 transition-all shadow-xs">
      {/* Sidebar Header */}
      <div className="flex items-center justify-between mb-4 border-b border-gf-border pb-3">
        <h2 className="text-base font-bold text-gf-text flex items-center gap-2">
          <span>Documentos</span>
          <span className="text-xs text-gf-text-muted font-normal bg-gf-surface-dim px-2 py-0.5 rounded-full">
            ({documents.length})
          </span>
        </h2>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg text-gf-text-muted hover:text-gf-text hover:bg-gf-surface-dim transition-colors"
            title="Colapsar panel"
          >
            <ChevronsLeft className="w-4 h-4" strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Action Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="font-semibold text-xs text-gf-text-muted uppercase tracking-wider">
          Categorías
        </span>
        <button
          type="button"
          onClick={() => setUploadModalOpen(true)}
          className="inline-flex items-center gap-1 text-xs font-semibold border border-gf-border rounded-lg px-2.5 py-1 text-gf-text hover:bg-gf-surface-dim transition-colors"
        >
          <Plus className="w-3.5 h-3.5 text-gf-red" />
          <span>Agregar</span>
        </button>
      </div>

      {/* Category Tabs */}
      <div className="space-y-2 mb-6">
        {categoryData.map((cat) => {
          const active = cat.key === selectedCategoryKey;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => setSelectedCategoryKey(cat.key)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                active
                  ? "bg-white border-gf-red text-gf-red shadow-2xs"
                  : "bg-white border-gf-border text-gf-text hover:bg-gf-surface-dim/40"
              }`}
            >
              <span>{categoryDisplayLabel(cat)}</span>
              <span
                className={`w-5 h-5 text-[10px] rounded-full flex items-center justify-center font-bold ${
                  active
                    ? "bg-gf-red text-white"
                    : "bg-gf-surface-dim text-gf-text-muted"
                }`}
              >
                {cat.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Category Documents List */}
      <div className="space-y-3 flex-1 overflow-y-auto max-h-[420px] pr-1">
        <h3 className="text-xs font-semibold text-gf-text-muted uppercase tracking-wider mb-2">
          {selectedCategory
            ? categoryDisplayLabel(selectedCategory)
            : ""}{" "}
          ({selectedCategory?.documents.length ?? 0})
        </h3>

        {selectedCategory?.codes.includes("BANK_STATEMENT") && (
          <BankStatementBatchActions
            caseId={caseId}
            documents={selectedCategory.documents}
          />
        )}

        {selectedCategory && selectedCategory.documents.length > 0 ? (
          selectedCategory.documents.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-col gap-3 bg-white border border-gf-border p-3.5 rounded-xl hover:border-gf-red/30 transition-all shadow-2xs"
            >
              <div className="flex items-start gap-2.5">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0 mt-0.5">
                  <FileText className="w-4 h-4" />
                </div>
                <p
                  className="text-xs font-semibold text-gf-text break-all leading-tight line-clamp-2"
                  title={doc.originalName}
                >
                  {doc.originalName}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gf-border/60">
                <div className="flex flex-col gap-0.5">
                  <StatusBadge
                    code={doc.documentStatus.code}
                    name={doc.documentStatus.name}
                  />
                  <span className="text-[10px] text-gf-text-muted mt-0.5">
                    {new Date(doc.createdAt).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
                <DocumentActions caseId={caseId} document={doc} />
              </div>
            </div>
          ))
        ) : (
          <div className="bg-gf-surface-dim/30 border border-dashed border-gf-border p-6 rounded-xl text-center">
            <p className="text-xs text-gf-text-muted">
              No hay documentos en esta categoría.
            </p>
            <button
              type="button"
              onClick={() => setUploadModalOpen(true)}
              className="text-xs font-semibold text-gf-red hover:underline mt-2 inline-block"
            >
              + Subir documento
            </button>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {uploadModalOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={handleUploadClose}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-xl border border-gf-border relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 border-b border-gf-border pb-3">
              <h2 className="text-lg font-bold text-gf-text">
                Agregar documento
              </h2>
              <button
                type="button"
                onClick={handleUploadClose}
                aria-label="Cerrar"
                className="p-1 rounded-lg text-gf-text-muted hover:text-gf-text hover:bg-gf-surface-dim transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <DocumentUpload
              caseId={caseId}
              documentTypes={documentTypes}
              onSuccess={handleUploadSuccess}
              defaultDocumentTypeId={preselectedDocumentTypeId}
              personType={personType}
              defaultOwner={selectedCategory?.owner}
            />
          </div>
        </div>
      )}
    </aside>
  );
}
