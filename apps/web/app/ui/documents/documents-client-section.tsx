"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { Document, DocumentType } from "@/app/lib/definitions";
import DocumentUpload from "./document-upload";
import DocumentList from "./document-list";

interface DocumentsClientSectionProps {
  caseId: string;
  documentTypes: DocumentType[];
  initialDocuments: Document[];
}

/**
 * Client wrapper that manages the documents section lifecycle.
 *
 * Uses `router.refresh()` after a successful upload to re-fetch
 * server-rendered data (the parent page's server component will
 * re-run with fresh documents).
 */
export function DocumentsClientSection({
  caseId,
  documentTypes,
  initialDocuments,
}: DocumentsClientSectionProps) {
  const router = useRouter();

  const handleUploadSuccess = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <>
      <DocumentUpload
        caseId={caseId}
        documentTypes={documentTypes}
        onSuccess={handleUploadSuccess}
      />
      <DocumentList documents={initialDocuments} />
    </>
  );
}
