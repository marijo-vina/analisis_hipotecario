# POC: Extracción por Coordenadas — Buró de Crédito

## Estado: ✅ Completada e integrada a producción

**Objetivo original:** Validar si `pdfjs-dist` podía extraer `paymentDueAmount`
de PDFs de buró de crédito por coordenadas, como alternativa al pipeline
OCR (Document AI) + Gemini.

**Resultado:** La POC fue exitosa y se integró al backend de producción en
`apps/api/src/documents/coordinate-extraction.service.ts` + `coordinate-grid.extractor.ts`.
Está activa por defecto (`COORDINATE_EXTRACTION_ENABLED=true`).

---

## Qué se construyó

Dos extractores incrementales que evolucionaron durante el experimento:

| Versión | Archivo | Qué hace |
|---|---|---|
| v2 | `extract_buro_payments.ts` | Extrae SOLO la columna "Monto a Pagar" por coordenadas |
| v3 | `extract_buro_financial_grid.ts` | Reconstruye TODAS las columnas financieras como grilla: saldo, límite, crédito máximo, último pago, monto a pagar, histórico MOP |

### Debug scripts auxiliares

| Archivo | Propósito |
|---|---|
| `_debug_banking.ts` | Diagnóstico de PDFs de créditos bancarios |
| `_debug_find.ts` | Búsqueda de texto por coordenadas para depuración |
| `_debug_santander.ts` | Diagnóstico específico para PDFs de Santander |
| `smoke-test.ts` | Prueba de humo para validar que el pipeline no se rompe |

---

## Stack del POC

| Componente | Herramienta |
|---|---|
| PDF reader | `pdfjs-dist` (Mozilla, Node.js) |
| Runtime | Node.js + TypeScript (`tsx`) |
| Lenguaje | TypeScript — mismo stack del repo |

---

## Flujo del algoritmo

1. **Extraer palabras con coordenadas** — `pdfjs-dist.getTextContent()` devuelve
   cada token con matriz de transformación (x, y, width, height).
2. **Agrupar en líneas** — tolerancia de 4px en Y.
3. **Detectar encabezados de columna** — búsqueda case-insensitive: "Saldo Actual",
   "Límite de Crédito", "Crédito Máximo", "Monto a Pagar", "Último Pago", "Vencido",
   "Histórico de Pagos".
4. **Calcular bandas de columna por midpoint** — cada columna tiene un rango X.
   Las palabras cuyo centro X cae dentro de una banda se asignan a esa columna.
5. **Detectar bloques de crédito** — heurística de posición X + indicadores de
   nombre de institución (ALL CAPS, keywords de bancos).
6. **Clasificar fuente de pago** — `BAND_MATCH` (valor dentro de la columna),
   `RESCUE` (rescatado por heurística extendida), `UNCONFIRMED` (sin coincidencia).

---

## Resultados

### Criterios de éxito

| Criterio | Resultado |
|---|---|
| `paymentDueAmount` coincide con el PDF en ≥80% de créditos | ✅ Alcanzado |
| Algoritmo detecta correctamente todas las instituciones | ✅ Alcanzado con heurística de orden posicional |
| Advertencias permiten depurar falsos negativos | ✅ Los diagnostic JSON de output/ facilitan el debug |

### Hallazgos

- **pdfjs-dist funciona para este caso de uso**, pero requiere heurísticas manuales
  para detección de columnas y manejo de variaciones entre layouts de banco.
- Los PDFs de Santander, Banorte, y Scotiabank tienen layouts de tabla
  ligeramente distintos. La detección de columnas por midpoint es robusta
  pero requirió ajustes por banco.
- La extracción de MOP codes desde la columna "Histórico de Pagos" fue el
  hallazgo más valioso: Gemini frecuentemente devolvía arrays vacíos para
  créditos en la mitad inferior del PDF. El grid extractor los captura
  consistentemente.
- Los status ("Vigente", "Cerrado") se extraen mejor desde la sección "Resumen
  de Créditos" que desde la tabla de detalle, porque el OCR en esa zona es
  más limpio.

---

## De POC a producción

La lógica de la POC se migró a servicios NestJS:

```
POC (experiments/)              →  Producción (apps/api/src/documents/)
────────────────────────────────────────────────────────────────────────
extract_buro_financial_grid.ts  →  coordinate-grid.extractor.ts
                                  coordinate-extraction.service.ts
Tipos y interfaces              →  coordinate-extraction.types.ts
Merge con Gemini                →  credit-bureau-extraction.service.ts
                                  (método mergeCoordinateResults)
```

### Jerarquía de autoridad en producción

1. **BAND_MATCH** — valor extraído dentro de la banda de columna → **autoritativo**
2. **RESCUE** — valor rescatado por heurística → **deferir a Gemini**
3. **UNCONFIRMED** — sin coincidencia → **deferir a Gemini**

Además de `paymentDueAmount`, el coordinate grid también alimenta `creditLimit`,
`mopCodes`, `status` y `sectionType` cuando Gemini devuelve null o valores
incompletos.

---

## Dirección recomendada a futuro: Python + pdfplumber

### Por qué

`pdfjs-dist` es una biblioteca de **renderizado** de PDFs adaptada para
extracción de texto. No fue diseñada para detectar tablas, bordes de celda,
o celdas combinadas. Esto obliga a implementar heurísticas manuales para
cada layout de banco.

**Python tiene bibliotecas construidas específicamente para este propósito:**

| Biblioteca | Ventaja sobre pdfjs-dist |
|---|---|
| `pdfplumber` | Detección nativa de tablas: bordes, celdas, alineación. Extrae filas y columnas como estructuras de datos, no como palabras sueltas |
| `camelot-py` | Extracción de tablas con alta precisión para PDFs financieros. Detecta bordes de celda incluso sin líneas visibles |
| `unstructured` | Framework unificado para parsing de documentos. Maneja PDFs, imágenes, y múltiples formatos con un solo API |

Además, Python tiene ventajas para los siguientes perfiles de cliente:

- **PFAE:** Constancia de Situación Fiscal del SAT y documentos de actividad
  empresarial. Formatos semi-estructurados que requieren NLP + extracción tabular.
- **Persona Moral:** Actas constitutivas, estados financieros, documentos
  corporativos con layouts impredecibles.

### Recomendación de arquitectura

```
NestJS (orquestador)  →  POST /extract/bureau  →  FastAPI (Python)
                         └─ recibe PDF URL        └─ pdfplumber extrae tabla
                         └─ mergea con Gemini      └─ devuelve JSON determinista
```

Con este enfoque:
- Python maneja TODO lo determinista: tablas, columnas, grillas, segmentación
- Gemini maneja SOLO lo semántico: clasificación, interpretación de texto libre
- La integración es vía REST entre servicios (Docker Compose o Cloud Run)

---

## Cómo ejecutar el POC

```bash
cd experiments/buro-pdf-coordinate-poc
npm install

# Copiar PDFs de buró a samples/ (no se commitean — carpeta en .gitignore)
# Ejecutar extracción de grid completo (v3, recomendado)
npx tsx extract_buro_financial_grid.ts samples/mi-buro.pdf

# Ejecutar extracción de payments solamente (v2)
npx tsx extract_buro_payments.ts samples/mi-buro.pdf
```

Salida en `output/`:
- `*_grid.json` — créditos con todas las columnas financieras + MOP codes + status
- `*_lines_diag.json` — diagnóstico de líneas detectadas
- `*_extraction.json` — reporte de pagos extraídos
- `*_extraction.csv` — tabla de pagos para Excel

---

## Interpretación de confianza

| Nivel | Significado |
|---|---|
| 🟢 high / BAND_MATCH | Valor numérico encontrado exactamente en la columna |
| 🟡 medium / RESCUE | Texto en la columna pero no parseable como número |
| 🔴 low / UNCONFIRMED | Extraído con heurística extendida o fallback |
