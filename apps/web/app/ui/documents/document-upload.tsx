"use client";

import { useState, useCallback } from "react";
import type { DocumentType } from "@/app/lib/definitions";

interface DocumentUploadProps {
  caseId: string;
  documentTypes: DocumentType[];
  onSuccess: () => void;
}

/**
 * Client component for uploading documents to a mortgage case.
 *
 * Renders a file input (accept PDF/JPEG/PNG), a document type dropdown,
 * and a submit button. Posts FormData to the Next.js Route Handler which
 * proxies to the NestJS upload endpoint.
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

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0] ?? null;
      setFile(selected);
      setError(null);
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!file) {
        setError("Seleccioná un archivo.");
        return;
      }
      if (!documentTypeId) {
        setError("Seleccioná un tipo de documento.");
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
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">
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
        <div>
          <label
            htmlFor="documentTypeId"
            className="block text-sm font-medium text-slate-700 mb-1"
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
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
          >
            <option value="">-- Seleccionar --</option>
            {documentTypes.map((dt) => (
              <option key={dt.id} value={dt.id}>
                {dt.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="file"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Archivo
          </label>
          <input
            id="file"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileChange}
            disabled={loading}
            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-slate-500">
            Formatos aceptados: PDF, JPEG, PNG. Máx. 10 MB.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading || !file || !documentTypeId}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Subiendo..." : "Subir documento"}
        </button>
      </form>
    </div>
  );
}
