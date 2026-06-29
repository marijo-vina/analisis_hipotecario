# Proposal: Rediseño del Workspace de Expediente

## Intent

La página de detalle de expediente (`/dashboard/expedientes/[id]`) tiene un layout disperso que obliga a scroll excesivo y mezcla información esencial con detalles que deberían estar en disclosure progresivo. La asesora hipotecaria necesita un workspace compacto y escaneable donde lo operativo sea visible de inmediato y los detalles completos estén a un clic en drawers laterales, sin perder ninguna acción existente.

## Scope

### In Scope
- Header compacto: flecha de regreso + breadcrumb simple + badge de estado + botones Editar/Cambiar estado
- Card de resumen reducido (4 campos: cliente, tipo persona, tipo crédito, monto)
- Nombre del cliente clickeable → Drawer Cliente (detalle completo)
- Clic en ID o "Ver expediente" → Drawer Expediente (detalle completo)
- Observaciones compactas editables con placeholder debajo del resumen
- Documentación en dos columnas: categorías (izq) con contador/progreso + lista de documentos (der)
- Lista de documentos compacta conservando todas las acciones actuales
- Carga de archivos como botón contextual "Agregar documento" dentro de documentación
- Datos extraídos en ancho completo con mejor espaciado
- Eliminación del card/placeholder de Análisis financiero

### Out of Scope
- Lógica de extracción (ExtractionSection, tabs, tablas)
- Backend (API, servicios, endpoints)
- Acciones de documentos (Ver, Procesar, Reprocesar, Reintentar, Eliminar)
- Branding y sistema de diseño (colores gf-*, radius, tipografía)
- Páginas de listado de expedientes o clientes
- Flujo de autenticación o proxy

## Capabilities

### New Capabilities
- `case-detail-header`: Header compacto con flecha regreso, breadcrumb, badge estado, botones Editar y Cambiar estado
- `client-drawer`: Drawer lateral derecho con detalle completo del cliente (nombre, RFC, CURP, email, teléfono, fechas)
- `case-detail-drawer`: Drawer lateral derecho con detalle completo del expediente (todos los campos del MortgageCase)
- `document-browser`: Layout dos columnas para documentación — categorías con contador/progreso a la izquierda, lista compacta de documentos a la derecha, con botón contextual "Agregar documento"
- `observations-editor`: Bloque compacto de observaciones editables inline con placeholder

### Modified Capabilities
- `frontend-mortgage-cases`: El layout general de la página de detalle cambia radicalmente — de grid 3 columnas con cards estáticos a workspace compacto con drawers de disclosure progresivo

## Approach

Reescribir `page.tsx` como orquestador del nuevo layout. Crear componentes client para los drawers (Sheet/Drawer pattern con overlay). Reutilizar `DocumentActions` intacto dentro de nueva lista compacta. Mover `DocumentUpload` de card independiente a botón contextual dentro de `document-browser`. `ExtractionSection` se mantiene intacto, solo se reposiciona.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/app/dashboard/expedientes/[id]/page.tsx` | Modified | Reescritura completa del layout |
| `apps/web/app/ui/common/page-header.tsx` | New variant | Header compacto con flecha de regreso |
| `apps/web/app/ui/documents/document-card-grid.tsx` | Replaced | Sustituido por document-browser dos columnas |
| `apps/web/app/ui/documents/document-upload-section.tsx` | Modified | De card independiente a botón contextual |
| `apps/web/app/ui/common/drawer.tsx` | New | Componente Drawer/Sheet reutilizable |
| `apps/web/app/ui/extraction/extraction-section.tsx` | Unchanged | Solo se reposiciona en el flujo |
| `apps/web/app/ui/documents/document-actions.tsx` | Unchanged | Se reutiliza dentro de nueva lista compacta |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Drawers bloquean interacción en pantallas pequeñas | Medium | Fallback a página completa en mobile (< lg breakpoint) |
| Performance con muchos documentos en lista compacta | Low | Virtualización o paginación simple si > 50 docs |
| Observaciones editables requieren server action nuevo | Low | Reutilizar PATCH existente de mortgage-cases con campo notes |
| Complejidad de estado client con dos drawers independientes | Low | Estado local con useState, sin contexto global |

## Rollback Plan

Revertir el commit de la rama `refine/ui-expediente-layout`. La página anterior queda intacta en git. No hay cambios de backend ni de schema que requieran migración.

## Dependencies

- Componente Drawer/Sheet reutilizable (crear o usar patrón con dialog de Radix/Tailwind)
- Server action para actualizar notes (o reutilizar PATCH existente)

## Success Criteria

- [ ] La página de detalle cabe en una viewport sin scroll en resolución 1440px con expediente típico
- [ ] Drawer Cliente y Drawer Expediente abren/cierran sin recargar página
- [ ] Documentación muestra categorías con progreso y permite navegar entre ellas
- [ ] Todas las acciones de documentos funcionan idéntico al estado actual
- [ ] Observaciones son editables inline y persisten al salir del campo
- [ ] No se rompe ningún flujo existente (extracción, cambio de estado, eliminación)

## Preguntas Abiertas

1. **Observaciones editables**: ¿El guardado debe ser automático al salir del campo (blur) o requiere botón "Guardar" explícito? ¿Hay límite de caracteres?

2. **Documentación — categorías**: ¿El progreso mostrado es "documentos procesados / documentos esperados" por categoría? ¿De dónde sale el número esperado — del catálogo de tipos de documento requeridos por tipo de crédito?

3. **Drawer Expediente**: ¿Qué campos adicionales al resumen actual debe mostrar? ¿Incluye datos del asesor, fechas de creación/actualización, o solo los datos del MortgageCase?

4. **Carga de archivos contextual**: ¿El botón "Agregar documento" abre un formulario inline dentro de la columna derecha, o abre un modal/drawer separado? ¿Mantiene el selector de tipo de documento actual?

5. **Mobile**: ¿Las asesoras usan esta página principalmente en desktop o también en tablet? Esto define si los drawers necesitan fallback completo a pantalla completa en mobile.
