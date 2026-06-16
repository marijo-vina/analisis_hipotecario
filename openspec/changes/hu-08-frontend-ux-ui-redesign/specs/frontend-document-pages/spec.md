# frontend-document-pages Specification

## Purpose

Document upload, list, preview, and deletion management within a mortgage case. Upload via drag-and-drop, list with status badges, preview via signed URL, delete with confirmation modal. No backend contract changes.

## Requirements

| ID | Requirement | AC |
|----|-------------|----|
| DOC-01 | Upload zone MUST support drag-and-drop or browse file selection, document type selector dropdown, file info display (name, size), and upload progress/loading state. Accepted formats: PDF, JPEG, PNG. Max: 10 MB. | AC-07 |
| DOC-02 | Document list table MUST show columns: Tipo, Archivo (original name), Estatus (StatusBadge), Fecha de carga, Acciones (Ver, Eliminar). Status badges SHALL use Spanish labels: Subido (sky), Validado (green), Rechazado (red), Procesado (teal), Error (red). | AC-07 |
| DOC-03 | "Ver" action MUST obtain signed URL via existing server action and display the document in an embedded viewer modal (DocumentPreviewDialog). For PDF files, render with `iframe`. For images (jpg/jpeg/png), render with `img`. The modal SHALL show: title "Vista previa del documento", file name, "Cerrar" button, and secondary "Abrir en nueva pestaña" button as fallback. | AC-07 |
| DOC-08 | DocumentPreviewDialog MUST handle edge cases: (a) if signed URL fetch fails, show "El documento no está disponible"; (b) if file type cannot be previewed (not PDF/image), show "Este tipo de archivo no se puede previsualizar. Puedes abrirlo en una nueva pestaña." with the secondary button enabled; (c) "Abrir en nueva pestaña" is always available as secondary option, never the primary behavior. No backend, endpoint, GCS, or TTL changes. | AC-07 |
| DOC-04 | "Eliminar" action MUST only be available for documents in "Subido" (UPLOADED) status. Clicking it SHALL open ConfirmDialog modal centered with dark overlay. | AC-07, AC-08 |
| DOC-05 | ConfirmDialog for delete MUST display file name in highlighted box, message "¿Estás segura de que deseas eliminar este documento?", Cancelar (secondary) and Eliminar (destructive) buttons. During delete execution, Eliminar button SHALL show loading state and both buttons SHALL be disabled. | AC-08 |
| DOC-06 | On successful upload, the document list SHALL refresh via router.refresh() to show the new document. On delete, the document SHALL be removed from the list and list refreshed. | AC-07 |
| DOC-07 | Error states (upload failure, delete failure, signed URL failure) MUST display human-readable error message in Spanish, never raw technical errors. | AC-07 |

### Scenarios

**DOC-01 — Upload flow:**
- GIVEN advisor on case detail → WHEN drags PDF onto upload zone → THEN file accepted, type selector enabled, "Subir documento" button enabled
- GIVEN no file selected → WHEN clicks "Subir documento" → THEN error "Seleccioná un archivo"
- GIVEN no document type selected → WHEN clicks submit → THEN error "Seleccioná un tipo de documento"
- GIVEN valid file + type → WHEN submits → THEN loading state on button, on success: form resets, list refreshes

**DOC-02 — Document list rendering:**
- GIVEN case has documents → WHEN list renders → THEN each row shows document type name, original filename, upload date formatted in Spanish locale, status badge, and action buttons
- GIVEN zero documents → WHEN list renders → THEN shows "No hay documentos cargados" message

**DOC-04 + DOC-05 — Delete confirmation flow:**
- GIVEN document in "Subido" status → WHEN clicks "Eliminar" → THEN modal opens, file name highlighted, Cancelar/Eliminar buttons visible
- GIVEN delete modal open → WHEN clicks "Cancelar" → THEN modal closes, document unchanged
- GIVEN delete modal open → WHEN clicks "Eliminar" → THEN button shows "Eliminando...", server action called, on success: modal closes, list refreshes
- GIVEN document NOT in "Subido" status → WHEN list renders → THEN "Eliminar" button hidden for that row

**DOC-03 + DOC-08 — Embedded preview flow:**
- GIVEN any document → WHEN clicks "Ver" → THEN signed URL fetched via existing server action, DocumentPreviewDialog opens with loading state
- GIVEN preview modal open with PDF → WHEN signed URL resolves → THEN `iframe` renders the PDF inline, file name visible, "Cerrar" and "Abrir en nueva pestaña" buttons present
- GIVEN preview modal open with JPEG/PNG → WHEN signed URL resolves → THEN `img` tag renders the image inline
- GIVEN signed URL fetch fails → WHEN modal opens → THEN error "El documento no está disponible", "Abrir en nueva pestaña" available as fallback
- GIVEN file type not PDF/image → WHEN clicks "Ver" → THEN message "Este tipo de archivo no se puede previsualizar. Puedes abrirlo en una nueva pestaña.", "Abrir en nueva pestaña" button enabled
- GIVEN preview modal open → WHEN clicks "Cerrar" → THEN modal closes, document unchanged
