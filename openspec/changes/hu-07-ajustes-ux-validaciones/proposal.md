# Proposal: HU-07 Ajustes UX y Validaciones

## Intent

Sprint 1 hardening: resolver gaps de UX y validación descubiertos tras completar HU-07. Los usuarios no pueden ver ni eliminar documentos subidos, los enums muestran códigos técnicos, y faltan validaciones de teléfono y edición de cliente/expediente. Todo sin cambios arquitectónicos ni OCR.

## Scope

### In Scope
- Ver documento: signed URL GCS + endpoint + botón "Ver"
- Eliminar documento: endpoint + confirmación + solo si no procesado
- Ocultar códigos técnicos en enums (CreditType, PersonType)
- Validar teléfono MX (10 dígitos) en backend y frontend
- Mostrar mensajes claros para RFC/CURP inválidos
- Editar cliente: UI con formulario pre-poblado (backend PATCH ya existe)
- Editar expediente: endpoint PUT + UI con formulario pre-poblado

### Out of Scope
- OCR, IA o procesamiento de documentos
- Cambios de esquema Prisma
- Eliminar cliente o expediente
- Reasignar cliente de un expediente

## Capabilities

### New Capabilities
- `document-view`: signed URL generation para previsualizar documentos GCS
- `document-delete`: eliminación de documento (DB + GCS) con confirmación
- `client-edit`: UI de edición de cliente con formulario pre-poblado
- `mortgage-case-edit`: endpoint y UI de edición de campos básicos del expediente

### Modified Capabilities
- `frontend-clients`: agregar validación de teléfono 10 dígitos y mensajes claros RFC/CURP
- `frontend-mortgage-cases`: quitar códigos técnicos de enum display; agregar botón "Editar expediente"

## Approach

5 work streams independientes:

1. **Enum Fix**: quitar concatenación `(code)` en `page.tsx` y `case-form.tsx` — solo mostrar `name`
2. **Doc View/Delete**: `GcsService.generateSignedUrl()` (5 min TTL) → `GET /documents/:id/view` → `DELETE /documents/:id` (solo si status=UPLOADED) → UI con "Ver" y "Eliminar" + confirmación
3. **Client Validation**: agregar `@Matches(/^\d{10}$/)` en DTOs → mensaje "El teléfono debe tener 10 dígitos"; frontend valida igual
4. **Client Edit**: crear `/dashboard/clientes/[id]/editar/page.tsx` reutilizando `ClientForm` en modo edit → server action `updateClient`
5. **Expediente Edit**: crear `UpdateMortgageCaseDto` → `MortgageCasesService.update()` → `PUT /mortgage-cases/:id` → crear `/dashboard/expedientes/[id]/editar/page.tsx`

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/documents/` | Modified | `gcs.service.ts`, `documents.service.ts`, `documents.controller.ts` — signed URL + delete |
| `apps/api/src/clients/dto/` | Modified | `create-client.dto.ts`, `update-client.dto.ts` — phone regex |
| `apps/api/src/mortgage-cases/` | Modified | New `update-mortgage-case.dto.ts`, `service.ts`, `controller.ts` — general update |
| `apps/web/app/ui/documents/` | Modified | `document-list.tsx` — view/delete buttons |
| `apps/web/app/dashboard/clientes/` | New + Modified | `[id]/editar/page.tsx` new; `[id]/page.tsx` add "Editar" |
| `apps/web/app/dashboard/expedientes/` | New + Modified | `[id]/editar/page.tsx` new; `[id]/page.tsx` remove codes, add "Editar" |
| `apps/web/app/ui/case-form.tsx` | Modified | Remove hardcoded `(SALARIED)` display |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|----------|
| GCS signed URL expira antes de carga | Low | 5 min TTL; usuario recarga página si falla |
| Borrado accidental de documento | Low | Modal de confirmación; solo permitido si status=UPLOADED |
| Perdida de archivo GCS si falla transacción | Low | Eliminar GCS primero, luego DB; si GCS falla, abortar |
| Break de tests existentes | Med | No tocar contratos de endpoints existentes; solo agregar |
| Reutilización de formulario complica estado | Low | Pasar `client` o `mortgageCase` como prop `defaultValues` |

## Rollback Plan

1. Revertir commits de esta change
2. Si signed URL causa problemas: deshabilitar botón "Ver" mientras se investiga
3. Si delete es problemático: deshabilitar botón "Eliminar" sin afectar el resto

## Dependencies

- **Requires**: HU-07 completado (upload de documentos funcional)
- **Blocks**: HU-08 (OCR/IA) — este hardening debe estar antes de procesar documentos

## Success Criteria

- [ ] Usuario puede hacer clic en "Ver" y abrir documento en nueva pestaña vía signed URL
- [ ] Usuario puede eliminar documento UPLOADED con confirmación; desaparece de DB y GCS
- [ ] Enums muestran solo nombre legible, sin código técnico
- [ ] Backend rechaza teléfono con menos/más de 10 dígitos o letras
- [ ] Frontend muestra mensaje claro "El teléfono debe tener 10 dígitos" antes de enviar
- [ ] Existe botón "Editar" en detalle de cliente y expediente con formulario pre-poblado
- [ ] Todos los tests existentes de HU-07 siguen pasando
- [ ] Nuevos tests cubren: signed URL, delete, phone validation, update endpoints
