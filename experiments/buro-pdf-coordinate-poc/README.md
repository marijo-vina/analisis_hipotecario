# POC: Extracción por Coordenadas — Buró de Crédito

**Objetivo**: Validar si `pdfjs-dist` (Mozilla, Node.js nativo) puede extraer
`paymentDueAmount` de PDFs de buró de crédito por coordenadas, como alternativa
al pipeline actual OCR (Document AI) + Gemini.

## Stack

| Componente       | Herramienta                        |
| ---------------- | ---------------------------------- |
| PDF reader       | `pdfjs-dist` (Mozilla, Node.js)    |
| Runtime          | Node.js + TypeScript (`tsx`)       |
| Lenguaje         | TypeScript — mismo stack del repo  |

## Estructura

```
buro-pdf-coordinate-poc/
├── README.md                    ← este archivo
├── extract_buro_payments.ts     ← script principal del POC
├── package.json
├── tsconfig.json
├── samples/                     ← gitignored — PDFs reales locales
└── output/                      ← gitignored — JSON, CSV, diagnóstico
```

## Flujo del algoritmo

1. **Extraer palabras con coordenadas** — `pdfjs-dist.getTextContent()` devuelve
   cada token con su matriz de transformación (x, y, width, height).
2. **Agrupar en líneas** — tolerancia de 4px en Y para considerar palabras
   de la misma línea.
3. **Detectar encabezado "Monto a Pagar"** — búsqueda case-insensitive con
   múltiples candidatos ("Monto a Pagar", "a Pagar", "Pago", "Payment").
4. **Detectar bloques de crédito** — heurística de posición X + indicadores
   de nombre de institución (ALL CAPS, keywords de bancos).
5. **Extraer paymentDueAmount** — palabra cuyo centro X cae dentro del rango
   de la columna detectada. Con fallback a columna más derecha.

## Uso

```bash
# Instalar dependencias (una sola vez)
npm install

# Copiá tus PDFs de buró a samples/ (no se commitean)
cp ~/Descargas/mi-buro.pdf samples/

# Ejecutar extracción
npm run extract -- samples/mi-buro.pdf
```

## Salida

- `output/<nombre>_lines_diag.json` — diagnóstico de líneas detectadas
  (primeras 20 líneas con coordenadas) para debug visual.
- `output/<nombre>_extraction.json` — reporte completo con pagos extraídos,
  bloques detectados, advertencias.
- `output/<nombre>_extraction.csv` — tabla de pagos para abrir en Excel.

## Interpretación de confianza

| Nivel  | Significado                                                |
| ------ | ---------------------------------------------------------- |
| 🟢 high  | Valor numérico encontrado exactamente en la columna       |
| 🟡 medium | Texto en la columna pero no parseable como número         |
| 🔴 low   | Extraído con heurística extendida o fallback               |

## Criterios de éxito del POC

- [ ] `paymentDueAmount` coincide con el valor visible en el PDF para ≥ 80%
  de los créditos.
- [ ] El algoritmo detecta correctamente todas las instituciones en el reporte.
- [ ] Las advertencias son informativas y permiten depurar falsos negativos.

## Próximos pasos (si el POC es exitoso)

1. Refinar heurísticas según hallazgos del POC.
2. Mover la lógica a un servicio NestJS en `apps/api/src/documents/`.
3. Integrar con `CreditBureauExtractionService` como estrategia primaria
   (fallback a Gemini solo si la extracción por coordenadas falla).
4. Agregar tests con snapshots de coordenadas de PDFs de muestra anonimizados.
