"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { DocumentType } from "@/app/lib/definitions";
import DocumentUpload from "./document-upload";

interface DocumentUploadSectionProps {
  caseId: string;
  documentTypes: DocumentType[];
}

/**
 * Client wrapper para DocumentUpload en el sidebar del expediente.
 * Maneja el refresh del router tras una subida exitosa.
 */
export default function DocumentUploadSection({
  caseId,
  documentTypes,
}: DocumentUploadSectionProps) {
  const router = useRouter();

  const handleUploadSuccess = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <DocumentUpload
      caseId={caseId}
      documentTypes={documentTypes}
      onSuccess={handleUploadSuccess}
    />
  );
}
