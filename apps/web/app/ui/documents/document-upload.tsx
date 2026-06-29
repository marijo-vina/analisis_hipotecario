"use client";

import { useState, useCallback, useRef } from "react";
import type { DocumentType } from "@/app/lib/definitions";
import Card from "@/app/ui/common/card";
import Button from "@/app/ui/common/button";

interface DocumentUploadProps {
  caseId: string;
  documentTypes: DocumentType[];
  onSuccess: () => void;
}

/**
 * Client component for uploading documents to a mortgage case.
 *
 * Renders a Card-wrapped form with a drag-and-drop zone (or browse file
 * button), a document type selector dropdown, file info display, and a
 * primary submit button. Posts FormData to the existing Next.js Route
 * Handler which proxies to the NestJS upload endpoint.
 *
 * Preserves the existing upload API call — only the UI is redesigned.
 */
export default function DocumentUpload({
  caseId,
  documentTypes,
  onSuccess,
}: DocumentUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [documentTypeId, setDocumentTypeId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    const dropped = e.dataTransfer.files?.[0] ?? null;
    if (dropped) {
      setFile(dropped);
      setError(null);
    }
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0] ?? null;
      setFile(selected);
      setError(null);
    },
    [],
  );

  // ---- Submit -------------------------------------------------------------
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!file) {
        setError("Selecciona un archivo");
        return;
      }
      if (!documentTypeId) {
        setError("Selecciona un tipo de documento");
        return;
      }

      setLoading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("documentTypeId", documentTypeId);

        const res = await fetch(
          `/api/mortgage-cases/${caseId}/documents/upload`,
          {
            method: "POST",
            body: formData,
          },
        );

        const body = await res.json();

        if (!res.ok) {
          const msg =
            typeof body.message === "string"
              ? body.message
              : "Error al subir el documento.";
          setError(msg);
          return;
        }

        // Success — reset form and notify parent
        setFile(null);
        setDocumentTypeId("");
        onSuccess();
      } catch {
        setError("No se pudo conectar con el servidor.");
      } finally {
        setLoading(false);
      }
    },
    [file, documentTypeId, caseId, onSuccess],
  );

  return (
    <Card>
      <h3 className="text-lg font-semibold text-gf-text mb-4">
        Cargar documento
      </h3>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Document type selector */}
        <div>
          <label
            htmlFor="documentTypeId"
            className="block text-sm font-medium text-gf-text mb-1"
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
            className="block w-full rounded-[var(--radius-sm)] border border-gf-border bg-white px-3 py-2 text-sm text-gf-text shadow-sm focus:border-gf-red focus:outline-none focus:ring-1 focus:ring-gf-red disabled:opacity-50"
            style={{ height: 'var(--input-height)' }}
          >
            <option value="">-- Seleccionar --</option>
            {documentTypes.map((dt) => (
              <option key={dt.id} value={dt.id}>
                {dt.name}
              </option>
            ))}
          </select>
        </div>

        {/* Drag-and-drop zone / file input */}
        <div>
          <label className="block text-sm font-medium text-gf-text mb-1">
            Archivo
          </label>

          <div
            className={`border-2 border-dashed rounded-[var(--radius-md)] p-6 text-center transition-colors cursor-pointer ${
              dragOver
                ? 'border-gf-red bg-gf-red-soft/50'
                : 'border-gf-border bg-gf-bg/30 hover:border-gf-red hover:bg-gf-red-soft/20'
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
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileChange}
              disabled={loading}
              className="hidden"
            />

            {file ? (
              <div className="text-sm text-gf-text">
                <p className="font-medium break-all">{file.name}</p>
                <p className="text-gf-text-muted text-xs mt-0.5">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gf-text-muted mb-1">
                  Arrastra el archivo aquí o
                </p>
                <span className="text-sm font-medium text-gf-red hover:text-gf-red-dark underline">
                  selecciona un archivo
                </span>
              </div>
            )}
          </div>

          <p className="mt-1.5 text-xs text-gf-text-muted">
            PDF, JPG, PNG hasta 10MB
          </p>
        </div>

        {/* Upload button */}
        <Button
          variant="primary"
          type="submit"
          disabled={loading || !file || !documentTypeId}
          loading={loading}
        >
          {loading ? "Subiendo..." : "Subir documento"}
        </Button>
      </form>
    </Card>
  );
}
