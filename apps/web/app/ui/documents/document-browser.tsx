"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  ChevronsLeft,
  ChevronsRight,
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

function categoryButtonClass(active: boolean): string {
  return active
    ? "bg-gf-red-soft border-[#F3C4CB] text-gf-red"
    : "bg-white border-gf-border text-gf-text hover:bg-gf-surface-dim/40";
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
  personType?: string;
}

function hoverCanOpen(): boolean {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export default function DocumentBrowser({
  caseId,
  documents,
  documentTypes,
  personType,
}: DocumentBrowserProps) {
  const router = useRouter();
  const [pinned, setPinned] = useState(false);
  const [peek, setPeek] = useState(false);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const dragDepth = useRef(0);
  const open = pinned || peek;

  useEffect(() => {
    return () => {
      if (openTimer.current) window.clearTimeout(openTimer.current);
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  const clearTimers = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };

  const schedulePeek = () => {
    if (pinned || !hoverCanOpen()) return;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
    if (peek || openTimer.current) return;
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      setPeek(true);
    }, 160);
  };

  const scheduleClose = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    openTimer.current = null;
    if (pinned || dragDepth.current > 0) return;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setPeek(false);
    }, 220);
  };

  const pinOpen = () => {
    clearTimers();
    setPinned(true);
    setPeek(false);
  };

  const collapse = () => {
    clearTimers();
    dragDepth.current = 0;
    setPinned(false);
    setPeek(false);
  };

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
    router.refresh();
  };

  const peeking = open && !pinned;

  const rail = (
    <aside className="w-full xl:w-16 bg-white border border-gf-border flex flex-row xl:flex-col items-center gap-3 px-3 py-3 xl:py-6 shrink-0 rounded-xl shadow-xs">
      <button
        type="button"
        onClick={pinOpen}
        className="p-2 rounded-xl text-gf-text-muted hover:text-gf-red hover:bg-gf-surface-dim transition-colors"
        title="Abrir documentos"
      >
        <ChevronsRight className="w-5 h-5" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={pinOpen}
        className="flex flex-1 xl:flex-none items-center xl:flex-col gap-2 text-left"
        title="Pasa el cursor para ver los documentos. Un clic los deja abiertos."
      >
        <span className="text-xs font-bold text-gf-text xl:[writing-mode:vertical-rl]">
          Documentos
        </span>
        <span className="inline-flex text-[10px] font-bold text-gf-text-muted bg-gf-surface-dim px-2 py-0.5 rounded-full">
          {documents.length}
        </span>
      </button>

      <div className="hidden xl:flex flex-col gap-3 items-center">
        {categoryData.map((cat) => {
          const active = cat.key === selectedCategoryKey;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => {
                setSelectedCategoryKey(cat.key);
                pinOpen();
              }}
              className={`relative p-2.5 rounded-xl border transition-all ${
                active
                  ? "bg-gf-red-soft text-gf-red border-[#F3C4CB]"
                  : "bg-gf-surface-dim/50 text-gf-text-muted border-transparent hover:bg-gf-surface-dim hover:text-gf-text"
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

  return (
    <div
      className={
        open
          ? "w-full xl:w-[320px] shrink-0"
          : "w-full xl:w-16 shrink-0"
      }
      onMouseEnter={schedulePeek}
      onMouseLeave={scheduleClose}
      onPointerDown={(event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest("[data-collapse-docs]")) return;
        if (open) pinOpen();
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepth.current += 1;
        clearTimers();
        setPeek(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) scheduleClose();
      }}
      onDrop={() => {
        dragDepth.current = 0;
        pinOpen();
      }}
      onDropCapture={pinOpen}
    >
      {open ? null : rail}
      {open && (
    <aside className="w-full bg-white border border-gf-border rounded-xl p-5 flex flex-col shadow-xs">
      {/* Sidebar Header */}
      <div className="flex items-center justify-between mb-4 border-b border-gf-border pb-3">
        <h2 className="text-base font-bold text-gf-text flex items-center gap-2">
          <span>Documentos</span>
          <span className="text-xs text-gf-text-muted font-normal bg-gf-surface-dim px-2 py-0.5 rounded-full">
            ({documents.length})
          </span>
        </h2>
        <button
          type="button"
          data-collapse-docs
          onClick={collapse}
          className="p-1.5 rounded-lg text-gf-text-muted hover:text-gf-text hover:bg-gf-surface-dim transition-colors"
          title="Comprimir documentos"
        >
          <ChevronsLeft className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
      {peeking && (
        <p className="-mt-2 mb-3 text-[10px] text-gf-text-muted">
          Clic para dejarlo abierto
        </p>
      )}

      {/* Category groups */}
      <div className="space-y-4 mb-5">
        {(personType === "PM"
          ? [
              {
                title: "Persona física · Accionista",
                items: categoryData.filter((cat) => cat.owner === "SHAREHOLDER"),
              },
              {
                title: "Persona moral · Empresa",
                items: categoryData.filter((cat) => cat.owner === "COMPANY"),
              },
            ]
          : [{ title: null, items: categoryData }]
        ).map((group) => (
          <div key={group.title ?? "categorias"} className="space-y-2">
            {group.title && (
              <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-gf-text-muted">
                {group.title}
              </p>
            )}
            {group.items.map((cat) => {
              const active = cat.key === selectedCategoryKey;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setSelectedCategoryKey(cat.key)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all border ${categoryButtonClass(active)}`}
                >
                  <span>{personType === "PM" ? cat.label : categoryDisplayLabel(cat)}</span>
                  <span
                    className={`w-5 h-5 text-[10px] rounded-full flex items-center justify-center font-bold ${
                      active
                        ? "bg-white text-gf-red"
                        : "bg-gf-surface-dim text-gf-text-muted"
                    }`}
                  >
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto max-h-[520px] pr-1">
        <h3 className="text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
          {selectedCategory
            ? categoryDisplayLabel(selectedCategory)
            : ""}{" "}
          ({selectedCategory?.documents.length ?? 0})
        </h3>

        <DocumentUpload
          key={selectedCategory?.key ?? "categoria"}
          caseId={caseId}
          documentTypes={documentTypes}
          onSuccess={handleUploadSuccess}
          allowedTypeCodes={selectedCategory?.codes}
          defaultDocumentTypeId={
            selectedCategory?.codes.length === 1 ? preselectedDocumentTypeId : undefined
          }
          personType={personType}
          defaultOwner={selectedCategory?.owner ?? "SHAREHOLDER"}
          lockOwner
        />

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
          <div className="bg-gf-surface-dim/30 border border-dashed border-gf-border p-4 rounded-xl text-center">
            <p className="text-xs text-gf-text-muted">
              No hay documentos en esta categoría.
            </p>
          </div>
        )}
      </div>
    </aside>
      )}
    </div>
  );
}
