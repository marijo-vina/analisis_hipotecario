"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import type { DocumentOwner, DocumentType } from "@/app/lib/definitions";
import {
  filterUploadableDocumentTypes,
  resolveUploadOwner,
} from "@/app/lib/required-documents";
import Button from "@/app/ui/common/button";
import { FileText, X, UploadCloud } from "lucide-react";

interface DocumentUploadProps {
  caseId: string;
  documentTypes: DocumentType[];
  onSuccess: () => void;
  defaultDocumentTypeId?: string;
  personType?: string;
  defaultOwner?: DocumentOwner;
}

export default function DocumentUpload({
  caseId,
  documentTypes,
  onSuccess,
  defaultDocumentTypeId,
  personType,
  defaultOwner = "SHAREHOLDER",
}: DocumentUploadProps) {
  const availableDocumentTypes = useMemo<DocumentType[]>(() => {
    const filtered = filterUploadableDocumentTypes(documentTypes, personType);
    const maxId = Math.max(0, ...filtered.map((dt) => Number(dt.id) || 0));
    return filtered.map((dt, index) => {
      if (dt.code !== "PASSPORT") return dt;
      if (dt.name && dt.id) return dt;
      return {
        ...dt,
        id: dt.id || maxId + 1000 + index,
        name: dt.name || "Pasaporte",
        isActive: dt.isActive ?? true,
      };
    });
  }, [documentTypes, personType]);

  const [files, setFiles] = useState<File[]>([]);
  const [documentTypeId, setDocumentTypeId] = useState<string>(
    defaultDocumentTypeId &&
      availableDocumentTypes.some((dt: DocumentType) => dt.id === Number(defaultDocumentTypeId))
      ? defaultDocumentTypeId
      : "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedOwner, setSelectedOwner] =
    useState<DocumentOwner>(defaultOwner);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isPm = personType === "PM";
  const selectedType = availableDocumentTypes.find(
    (dt) => String(dt.id) === documentTypeId,
  );
  const selectedTypeCode = selectedType?.code ?? "";
  const resolvedOwner = resolveUploadOwner(
    personType,
    selectedTypeCode,
    selectedOwner,
  );

  // ---- Drop handlers ------------------------------------------------------
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files ?? []);
    if (droppedFiles.length > 0) {
      setFiles((prev) => [...prev, ...droppedFiles]);
      setError(null);
    }
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files ?? []);
      if (selectedFiles.length > 0) {
        setFiles((prev) => [...prev, ...selectedFiles]);
        setError(null);
      }
      // Reset input value to allow selecting same file again if deleted
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [],
  );

  const removeFile = useCallback((indexToRemove: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  }, []);

  // ---- Submit -------------------------------------------------------------
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (files.length === 0) {
        setError("Selecciona al menos un archivo.");
        return;
      }
      if (!documentTypeId) {
        setError("Selecciona el tipo de documento.");
        return;
      }

      setLoading(true);

      let successCount = 0;
      const uploadErrors: string[] = [];

      try {
        for (const f of files) {
          const formData = new FormData();
          formData.append("file", f);
          formData.append("documentTypeId", documentTypeId);
          if (resolvedOwner) {
            formData.append("owner", resolvedOwner);
          }

          const res = await fetch(
            `/api/mortgage-cases/${caseId}/documents/upload`,
            {
              method: "POST",
              body: formData,
            },
          );

          if (res.ok) {
            successCount++;
          } else {
            const body = await res.json().catch(() => ({}));
            uploadErrors.push(
              typeof body.message === "string"
                ? body.message
                : `Error al subir ${f.name}`,
            );
          }
        }

        if (successCount > 0) {
          setFiles([]);
          setDocumentTypeId("");
          onSuccess();
        }

        if (uploadErrors.length > 0) {
          setError(uploadErrors.join(" | "));
        }
      } catch {
        setError("No se pudo conectar con el servidor.");
      } finally {
        setLoading(false);
      }
    },
    [files, documentTypeId, caseId, onSuccess, resolvedOwner],
  );

  const submitLabel = (() => {
    if (loading) return "Subiendo...";
    if (files.length <= 1) return "Subir documento";
    return `Subir ${files.length} documentos`;
  })();

  return (
    <div className="space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs font-medium text-red-700"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Document type selector */}
        <div>
          <label
            htmlFor="documentTypeId"
            className="block text-xs font-semibold text-gf-text mb-1"
          >
            Tipo de documento
          </label>
          <select
            id="documentTypeId"
            value={documentTypeId}
            onChange={(e) => {
              setDocumentTypeId(e.target.value);
              setError(null);
            }}
            disabled={loading}
            className="block w-full rounded-xl border border-gf-border bg-white px-3 py-2 text-sm text-gf-text shadow-2xs focus:border-gf-red focus:outline-none focus:ring-1 focus:ring-gf-red disabled:opacity-50 h-10 font-medium"
          >
            <option value="">-- Seleccionar categoría --</option>
            {availableDocumentTypes.map((dt: DocumentType) => (
              <option key={dt.id} value={dt.id}>
                {dt.name}
              </option>
            ))}
          </select>
        </div>

        {isPm && (
          <div>
            <label
              htmlFor="documentOwner"
              className="block text-xs font-semibold text-gf-text mb-1"
            >
              Titular del documento
            </label>
            <select
              id="documentOwner"
              value={resolvedOwner ?? selectedOwner}
              onChange={(e) =>
                setSelectedOwner(e.target.value as DocumentOwner)
              }
              disabled={loading || selectedTypeCode === "ARTICLES_OF_INCORPORATION"}
              className="block w-full rounded-xl border border-gf-border bg-white px-3 py-2 text-sm text-gf-text shadow-2xs focus:border-gf-red focus:outline-none focus:ring-1 focus:ring-gf-red disabled:opacity-50 h-10 font-medium"
            >
              <option value="SHAREHOLDER">Accionista</option>
              <option value="COMPANY">Empresa</option>
            </select>
            {selectedTypeCode === "ARTICLES_OF_INCORPORATION" && (
              <p className="mt-1 text-[11px] text-gf-text-muted">
                El acta constitutiva se guarda como documento de la empresa.
              </p>
            )}
          </div>
        )}

        {/* Drag-and-drop zone / file input */}
        <div>
          <label className="block text-xs font-semibold text-gf-text mb-1">
            Archivos ({files.length})
          </label>

          <div
            className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors cursor-pointer ${
              dragOver
                ? "border-gf-red bg-gf-red-soft/40"
                : "border-gf-border bg-gf-bg/30 hover:border-gf-red/60 hover:bg-gf-surface-dim/40"
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              id="file"
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileChange}
              disabled={loading}
              className="hidden"
            />

            <UploadCloud className="w-8 h-8 text-gf-text-muted mx-auto mb-1.5 stroke-[1.5]" />

            <p className="text-xs text-gf-text-muted mb-1 font-medium">
              Arrastra tus archivos aquí o
            </p>
            <span className="text-xs font-bold text-gf-red hover:underline">
              selecciona varios archivos
            </span>
          </div>

          <p className="mt-1 text-[11px] text-gf-text-muted">
            PDF, JPG, PNG hasta 10MB cada uno. Puedes seleccionar múltiples archivos.
          </p>
        </div>

        {/* Lista de archivos seleccionados */}
        {files.length > 0 && (
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {files.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="flex items-center justify-between p-2 rounded-lg bg-gf-surface-dim/50 border border-gf-border text-xs"
              >
                <div className="flex items-center gap-2 truncate pr-2">
                  <FileText className="w-4 h-4 text-gf-text-muted shrink-0" />
                  <span className="font-semibold text-gf-text truncate">
                    {file.name}
                  </span>
                  <span className="text-gf-text-muted text-[10px] shrink-0">
                    ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  className="text-gf-text-muted hover:text-red-600 p-1 rounded-md transition-colors"
                  title="Quitar archivo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Submit Button */}
        <Button
          variant="primary"
          type="submit"
          disabled={loading || files.length === 0 || !documentTypeId}
          loading={loading}
        >
          {submitLabel}
        </Button>
      </form>
    </div>
  );
}
