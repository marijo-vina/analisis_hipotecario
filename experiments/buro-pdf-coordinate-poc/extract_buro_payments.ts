/**
 * ============================================================================
 * POC: Extracción por coordenadas de "Monto a Pagar" desde PDF de buró de crédito
 *
 * Stack:  pdfjs-dist (Mozilla) — nativo Node.js, sin dependencias Python.
 * Objetivo: Validar si la extracción posicional reemplaza el pipeline OCR+IA
 *           para el campo paymentDueAmount.
 *
 * Uso:    npm run extract -- samples/mi-buro.pdf
 * Salida: output/<nombre-archivo>.json + output/<nombre-archivo>.csv
 *
 * Flujo:
 *   1. Extraer todas las palabras con coordenadas (x, y, width, height)
 *   2. Agrupar palabras en líneas por coordenada Y con tolerancia
 *   3. Detectar encabezado "Monto a Pagar" → calcular rango X de la columna
 *   4. Detectar bloques de crédito (institución + filas de datos)
 *   5. Extraer paymentDueAmount de la columna correcta por bloque
 *
 * ⚠️  POC — no integrar al backend. Los resultados deben revisarse manualmente
 *     contra el PDF original antes de tomar decisiones de producción.
 * ============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// ── Configuración de pdfjs-dist para Node.js (sin worker, solo texto) ──────
// No configuramos worker — getTextContent() no requiere renderizado.

/** Shape of a text item returned by pdfjs-dist getTextContent */
interface TextItemLike {
  str: string;
  dir: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL: boolean;
}

// ── Tipos ──────────────────────────────────────────────────────────────────

/** Palabra individual con su posición en la página */
interface WordToken {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageNum: number;
}

/** Línea de texto: grupo de palabras en la misma coordenada Y */
interface TextLine {
  words: WordToken[];
  y: number;
  xMin: number;
  xMax: number;
  fullText: string;
  pageNum: number;
}

/** Encalbezado de columna detectado */
interface ColumnHeader {
  text: string;
  xMin: number;
  xMax: number;
  y: number;
  pageNum: number;
}

/** Bloque de crédito: institución + sus filas de datos */
interface CreditBlock {
  institutionLine: TextLine | null;
  dataLines: TextLine[];
  pageNum: number;
  yStart: number;
  yEnd: number;
}

/** Resultado final de extracción */
interface ExtractedPayment {
  page: number;
  institution: string;
  paymentDueAmount: string;
  amountValue: number | null;
  confidence: 'high' | 'medium' | 'low';
  sourceY: number;
  sourceX: number;
}

interface ExtractionReport {
  sourceFile: string;
  totalPages: number;
  totalWords: number;
  totalLines: number;
  headersFound: ColumnHeader[];
  creditBlocksDetected: number;
  payments: ExtractedPayment[];
  warnings: string[];
}

// ── Constantes ─────────────────────────────────────────────────────────────

/** Tolerancia en puntos para agrupar palabras como misma línea */
const Y_TOLERANCE = 4;

/** Márgen extra alrededor del encabezado para capturar la columna completa */
const COLUMN_PADDING = 40;

/** Header texts to search for (ordered by priority) */
const HEADER_CANDIDATES = [
  'Monto a Pagar',
  'Monto a',
  'a Pagar',
  'Pago',
  'Payment',
];

/** Words that suggest a line is an institution name rather than data */
const INSTITUTION_INDICATORS = [
  /banco|bank/i,
  /scotiabank|santander|banamex|banorte|bbva|hsbc|amex|american express/i,
  /sofom|inbursa|nu mexico|telcel|telmex|gribma|mercado credito|circulo credito/i,
  /financier/i,
  /hipotec/i,
];

/** Lines containing these keywords are NOT credit institutions (headers, sections, etc.) */
const NON_INSTITUTION_KEYWORDS = [
  'pago crédito máximo',
  'clave de observación',
  'detalle de créditos',
  'declarativa del consumidor',
  'documento sin valor',
  'consulta de',
  'historial crediticio',
  'número de créditos',
  'total de créditos',
  'resumen',
  'score',
  'calificación',
  'folio',
  'fecha de consulta',
  'datos generales',
  'domicilio',
  'empleo',
  'reporte de crédito especial',
  'buro de credito',
  'buro de crédito',
  'esta consulta pertenece',
  'sociedad de información',
  'reposición',
  'internet:',
  'crediticia y sus usuarios',
  'publicadas por el banco',
  'crédito / cuenta',
  'cierre monto',
  'responsabilidad cierre',
  'crédito asociado',
  'crédito asegurado',
  'créditos bancarios',
  'créditos no bancarios',
  'cc=cuenta cancelada',
  'ntes ca=cuenta',
  'apertura ultimo moneda',
  'límite de crédito saldo',
  'aclaración ante los otorgantes',
  'reservada para la persona',
  'costo de $',
];

// ── Stage 1: Extraer palabras con coordenadas ─────────────────────────────

async function extractAllWords(pdfPath: string): Promise<WordToken[]> {
  const buffer = fs.readFileSync(pdfPath);
  const data = new Uint8Array(buffer).buffer; // Convert Buffer to ArrayBuffer

  const doc = await pdfjsLib.getDocument({ data, disableFontFace: true }).promise;
  const allWords: WordToken[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();

    for (const item of textContent.items) {
      const textItem = item as TextItemLike;
      const text = textItem.str?.trim();
      if (!text) continue;

      // La matriz de transformación: [scaleX, skewY, skewX, scaleY, translateX, translateY]
      const transform = textItem.transform;
      const x = transform[4];
      const y = transform[5];
      const width = textItem.width;
      const height = textItem.height;

      // Coordenada Y desde arriba de la página (pdfjs usa base desde abajo)
      const viewport = page.getViewport({ scale: 1 });
      const yFromTop = viewport.height - y;

      allWords.push({
        text,
        x,
        y: yFromTop,
        width,
        height: height || 10,
        pageNum,
      });
    }
  }

  return allWords;
}

// ── Stage 2: Agrupar palabras en líneas ───────────────────────────────────

function groupIntoLines(words: WordToken[]): TextLine[] {
  // Ordenar por página, luego Y, luego X
  const sorted = [...words].sort((a, b) => {
    if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
    if (Math.abs(a.y - b.y) > Y_TOLERANCE) return a.y - b.y;
    return a.x - b.x;
  });

  const lines: TextLine[] = [];
  let currentGroup: WordToken[] = [];
  let currentY = sorted.length > 0 ? sorted[0].y : 0;
  let currentPage = sorted.length > 0 ? sorted[0].pageNum : 1;

  for (const word of sorted) {
    if (
      word.pageNum !== currentPage ||
      Math.abs(word.y - currentY) > Y_TOLERANCE
    ) {
      if (currentGroup.length > 0) {
        lines.push(makeLine(currentGroup, currentY, currentPage));
      }
      currentGroup = [word];
      currentY = word.y;
      currentPage = word.pageNum;
    } else {
      currentGroup.push(word);
    }
  }

  if (currentGroup.length > 0) {
    lines.push(makeLine(currentGroup, currentY, currentPage));
  }

  return lines;
}

function makeLine(words: WordToken[], y: number, pageNum: number): TextLine {
  const xs = words.map((w) => w.x);
  const xMaxs = words.map((w) => w.x + w.width);
  return {
    words,
    y,
    xMin: Math.min(...xs),
    xMax: Math.max(...xMaxs),
    fullText: words.map((w) => w.text).join(' '),
    pageNum,
  };
}

// ── Stage 3: Detectar encabezado "Monto a Pagar" ──────────────────────────

function findPaymentHeaders(
  lines: TextLine[],
  allWords: WordToken[],
): { headers: ColumnHeader[]; warnings: string[] } {
  const headers: ColumnHeader[] = [];
  const warnings: string[] = [];

  // ── Paso 1: buscar "Monto a Pagar" como frase completa ──────────────────
  for (const line of lines) {
    const lower = line.fullText.toLowerCase();
    const matchIdx = lower.indexOf('monto a pagar');
    if (matchIdx === -1) continue;

    const { xMin, xMax } = getSubstringBounds(line, matchIdx, matchIdx + 14);
    headers.push({
      text: 'Monto a Pagar',
      xMin: xMin - COLUMN_PADDING,
      xMax: xMax + COLUMN_PADDING,
      y: line.y,
      pageNum: line.pageNum,
    });
    break;
  }

  // ── Paso 2: fallback — buscar "Monto a" y expandir con "Pagar" adyacente
  if (headers.length === 0) {
    for (const line of lines) {
      const lower = line.fullText.toLowerCase();
      const matchIdx = lower.indexOf('monto a');
      if (matchIdx === -1) continue;

      const { xMin, xMax: montoAXMax } = getSubstringBounds(line, matchIdx, matchIdx + 7);

      // Buscar "Pagar" en la misma línea, a la derecha de "Monto a"
      let pagarXMax = montoAXMax;
      let foundPagar = false;
      for (const word of line.words) {
        if (word.text.toLowerCase() === 'pagar' && word.x > xMin) {
          pagarXMax = Math.max(pagarXMax, word.x + word.width);
          foundPagar = true;
          break;
        }
      }

      // Si no está en la misma línea, buscar en líneas cercanas (misma página, ±15px en Y)
      if (!foundPagar) {
        for (const nearby of lines) {
          if (
            nearby.pageNum === line.pageNum &&
            Math.abs(nearby.y - line.y) < 20 &&
            nearby.y >= line.y
          ) {
            for (const word of nearby.words) {
              if (word.text.toLowerCase() === 'pagar' && word.x > xMin - 30) {
                pagarXMax = Math.max(pagarXMax, word.x + word.width);
                foundPagar = true;
                break;
              }
            }
          }
          if (foundPagar) break;
        }
      }

      const colXMin = xMin - COLUMN_PADDING;
      const colXMax = pagarXMax + COLUMN_PADDING;

      headers.push({
        text: foundPagar ? 'Monto a Pagar (expandido)' : 'Monto a',
        xMin: colXMin,
        xMax: colXMax,
        y: line.y,
        pageNum: line.pageNum,
      });

      if (!foundPagar) {
        warnings.push(
          `Encabezado parcial: "Monto a" encontrado pero "Pagar" no ubicado. ` +
          `Columna estimada X [${colXMin.toFixed(0)}–${colXMax.toFixed(0)}]. Verificar contra PDF.`,
        );
      }
      break;
    }
  }

  // ── Paso 3: fallback con otros candidatos ───────────────────────────────
  if (headers.length === 0) {
    for (const candidate of ['a Pagar', 'Pago', 'Payment']) {
      for (const line of lines) {
        const matchIdx = line.fullText.toLowerCase().indexOf(candidate.toLowerCase());
        if (matchIdx === -1) continue;

        const { xMin, xMax } = getSubstringBounds(line, matchIdx, matchIdx + candidate.length);
        headers.push({
          text: candidate,
          xMin: xMin - COLUMN_PADDING,
          xMax: xMax + COLUMN_PADDING,
          y: line.y,
          pageNum: line.pageNum,
        });
        warnings.push(
          `Encabezado parcial detectado: "${candidate}". Columna estimada en X [${(xMin - COLUMN_PADDING).toFixed(0)}, ${(xMax + COLUMN_PADDING).toFixed(0)}].`,
        );
        break;
      }
      if (headers.length > 0) break;
    }
  }

  if (headers.length === 0) {
    warnings.push(
      'No se encontró ningún encabezado de pago. ' +
      'Revisar si el PDF tiene "Monto a Pagar" como texto seleccionable.',
    );
  }

  return { headers, warnings };
}

/** Dado un índice de caracteres en fullText, calcula el bounding box de ese substring */
function getSubstringBounds(
  line: TextLine,
  charStart: number,
  charEnd: number,
): { xMin: number; xMax: number } {
  let accumulated = 0;
  let xMin = Infinity;
  let xMax = -Infinity;

  for (const word of line.words) {
    const wordStart = accumulated;
    const wordEnd = accumulated + word.text.length;
    accumulated = wordEnd + 1; // +1 por el espacio entre palabras al reconstruir fullText

    // ¿Este word se solapa con el rango [charStart, charEnd)?
    if (wordEnd > charStart && wordStart < charEnd) {
      xMin = Math.min(xMin, word.x);
      xMax = Math.max(xMax, word.x + word.width);
    }
  }

  return {
    xMin: xMin === Infinity ? line.xMin : xMin,
    xMax: xMax === -Infinity ? line.xMax : xMax,
  };
}

// ── Stage 4: Detectar bloques de crédito ──────────────────────────────────

function detectCreditBlocks(
  lines: TextLine[],
  headerY: number,
  pageNum: number | null,
): { blocks: CreditBlock[]; warnings: string[] } {
  const warnings: string[] = [];

  // Filtrar líneas que están debajo del encabezado
  // Incluir la página del header y la inmediata siguiente (páginas 4-5 típicamente).
  // Detener en cuanto se detecta contenido de "historial de consultas" (ruido).
  let dataLines: TextLine[];

  if (pageNum !== null) {
    const maxPage = pageNum + 1; // solo header page + 1 página siguiente
    const stopKeywords = ['consulta de', 'historial crediticio'];

    dataLines = [];
    for (const l of lines) {
      // Parar en páginas más allá del límite
      if (l.pageNum > maxPage) break;

      if (l.pageNum < pageNum) continue;
      if (l.pageNum === pageNum && l.y <= headerY) continue;

      // Detectar inicio de sección de consultas (página con "Consulta de")
      const lower = l.fullText.toLowerCase();
      if (stopKeywords.some((k) => lower.includes(k)) && l.pageNum > pageNum) {
        break; // dejar de procesar — el resto es historial de consultas
      }

      dataLines.push(l);
    }
  } else {
    dataLines = [...lines];
  }

  if (dataLines.length === 0) {
    warnings.push('No se encontraron líneas de datos debajo del encabezado.');
    return { blocks: [], warnings };
  }

  // ── Clasificar cada línea ───────────────────────────────────────────────
  // Heurística mejorada:
  //   - INSTITUCIÓN: línea con pocos números (<25%), texto alfabético dominante,
  //     posiblemente ALL CAPS. NUNCA una línea con muchos números.
  //   - DATO: línea con números alineados bajo columnas.
  //   - IGNORAR: encabezados de tabla, secciones, líneas vacías.

  const blocks: CreditBlock[] = [];
  let currentBlock: CreditBlock | null = null;

  for (const line of dataLines) {
    // Saltar líneas que claramente no son datos de crédito
    if (shouldSkipLine(line)) continue;

    // ¿Es una institución conocida por nombre? (Santander, Banamex, etc.)
    const isKnownInstitution = matchesKnownInstitution(line);

    // Si NO es institución conocida, aplicar regla de ratio numérico
    if (!isKnownInstitution) {
      const numericRatio = getNumericWordRatio(line);
      // REGLA CLAVE: si >30% de palabras son numéricas, NUNCA es institución
      if (numericRatio > 0.30) {
        if (currentBlock !== null) {
          currentBlock.dataLines.push(line);
          currentBlock.yEnd = line.y;
        }
        continue;
      }
    }

    const isInstitution = isKnownInstitution || isInstitutionLine(line);

    if (isInstitution) {
      // Cerrar bloque anterior si existe
      if (currentBlock && currentBlock.dataLines.length > 0) {
        blocks.push(currentBlock);
      }

      // Iniciar nuevo bloque — pero verificar si la línea anterior
      // sin datos es parte del nombre de ESTA institución (multi-línea)
      if (
        currentBlock &&
        currentBlock.dataLines.length === 0 &&
        currentBlock.institutionLine
      ) {
        // Fusionar: la línea anterior era solo nombre (sin datos),
        // esta también es nombre → concatenar
        const mergedWords: WordToken[] = [
          ...currentBlock.institutionLine.words,
          ...line.words,
        ];
        currentBlock = {
          institutionLine: makeLine(
            mergedWords,
            line.y,
            line.pageNum,
          ),
          dataLines: [],
          pageNum: line.pageNum,
          yStart: currentBlock.yStart,
          yEnd: line.y,
        };
      } else {
        currentBlock = {
          institutionLine: line,
          dataLines: [],
          pageNum: line.pageNum,
          yStart: line.y,
          yEnd: line.y,
        };
      }
    } else if (currentBlock !== null) {
      // Agregar línea de dato al bloque actual
      currentBlock.dataLines.push(line);
      currentBlock.yEnd = line.y;
    }
    // Si no hay bloque actual y es línea no-institución, la ignoramos
  }

  // Cerrar último bloque
  if (currentBlock && currentBlock.dataLines.length > 0) {
    blocks.push(currentBlock);
  }

  if (blocks.length === 0) {
    warnings.push('No se detectaron bloques de crédito en los datos.');
  }

  return { blocks, warnings };
}

/** Líneas que deben ignorarse completamente (encabezados, secciones) */
function shouldSkipLine(line: TextLine): boolean {
  const lower = line.fullText.toLowerCase();

  // Vacía o muy corta
  if (line.fullText.trim().length < 2) return true;

  // Coincide con keywords de no-institución
  for (const keyword of NON_INSTITUTION_KEYWORDS) {
    if (lower.includes(keyword)) return true;
  }

  return false;
}

/** Verifica si la línea contiene el nombre de una institución financiera conocida */
function matchesKnownInstitution(line: TextLine): boolean {
  const text = line.fullText.trim();
  for (const pattern of INSTITUTION_INDICATORS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

/** Calcula qué proporción de palabras en la línea son numéricas */
function getNumericWordRatio(line: TextLine): number {
  const words = line.fullText.trim().split(/\s+/);
  if (words.length === 0) return 0;
  const numeric = words.filter((w) => /^[\d,\.]+$/.test(w));
  return numeric.length / words.length;
}

/** Determina si una línea es nombre de institución financiera (no dato numérico) */
function isInstitutionLine(line: TextLine): boolean {
  const text = line.fullText.trim();
  const lower = text.toLowerCase();

  // ── Criterio 1: coincide con indicadores conocidos ────────────────────
  for (const pattern of INSTITUTION_INDICATORS) {
    if (pattern.test(text)) return true;
  }

  // ── Criterio 2: ALL CAPS, pocos números, no es dato ───────────────────
  const words = text.split(/\s+/);
  const alphaWords = words.filter((w) => /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ]+$/.test(w));
  const numericWords = words.filter((w) => /^[\d,\.]+$/.test(w));
  const mixedWords = words.filter(
    (w) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(w) && /\d/.test(w),
  );

  // Si >25% son números, definitivamente NO es institución
  if (numericWords.length > words.length * 0.25) return false;

  // ALL CAPS dominante con pocos números
  if (
    alphaWords.length > 1 &&
    alphaWords.length >= words.length * 0.3 &&
    numericWords.length <= words.length * 0.2 &&
    mixedWords.length === 0 &&
    !/pago|crédito máximo|clave|observación|detalle|declarativa|documento sin valor/i.test(lower)
  ) {
    return true;
  }

  return false;
}

// ── Stage 5: Extraer paymentDueAmount ─────────────────────────────────────

function extractPaymentAmounts(
  blocks: CreditBlock[],
  columnHeaders: ColumnHeader[],
): { payments: ExtractedPayment[]; warnings: string[] } {
  const payments: ExtractedPayment[] = [];
  const warnings: string[] = [];

  if (columnHeaders.length === 0) {
    // Sin header, no podemos saber qué columna es — intentar última columna como fallback
    warnings.push(
      'Sin encabezado de columna. Intentando extraer de la columna más a la derecha como fallback.',
    );
    return { payments: extractFromRightmostColumn(blocks, warnings), warnings };
  }

  const header = columnHeaders[0]; // Usar el más prioritario

  for (const block of blocks) {
    const institution = block.institutionLine?.fullText ?? '(desconocida)';

    // Buscar en todas las líneas de datos del bloque
    let bestMatch: ExtractedPayment | null = null;

    for (const dataLine of block.dataLines) {
      const wordInColumn = findBestWordInColumn(dataLine, header.xMin, header.xMax);

      if (wordInColumn) {
        const amount = parseAmount(wordInColumn.text);

        const match: ExtractedPayment = {
          page: dataLine.pageNum,
          institution,
          paymentDueAmount: wordInColumn.text,
          amountValue: amount,
          confidence: amount !== null ? 'high' : 'medium',
          sourceY: dataLine.y,
          sourceX: wordInColumn.x,
        };

        // Preferir el match más cercano al centro de la columna
        // (ignorar años como 2023/2024 que no son montos de pago)
        if (
          !bestMatch ||
          (isLikelyPaymentAmount(wordInColumn.text) &&
            (!isLikelyPaymentAmount(bestMatch.paymentDueAmount) ||
              columnDistance(wordInColumn, header) <
                columnDistanceFromStr(bestMatch, header)))
        ) {
          bestMatch = match;
        }
      }
    }

    if (bestMatch) {
      payments.push(bestMatch);
    } else {
      // Intento con tolerancia extendida
      const extended = findWordInColumnExtended(
        block,
        header.xMin,
        header.xMax,
      );
      if (extended) {
        payments.push(extended);
      } else {
        payments.push({
          page: block.pageNum,
          institution,
          paymentDueAmount: 'NO_ENCONTRADO',
          amountValue: null,
          confidence: 'low',
          sourceY: block.yStart,
          sourceX: 0,
        });
        warnings.push(
          `No se encontró monto en la columna de pago para "${institution}" ` +
          `(columna X: ${header.xMin.toFixed(0)}–${header.xMax.toFixed(0)}).`,
        );
      }
    }
  }

  return { payments, warnings };
}

function findWordInColumn(
  line: TextLine,
  colXMin: number,
  colXMax: number,
): WordToken | null {
  for (const word of line.words) {
    const wordCenter = word.x + word.width / 2;
    if (wordCenter >= colXMin && wordCenter <= colXMax) {
      return word;
    }
  }
  return null;
}

function findWordInColumnExtended(
  block: CreditBlock,
  colXMin: number,
  colXMax: number,
): ExtractedPayment | null {
  // Tolerancia extendida: ±30% del ancho de la columna
  const colWidth = colXMax - colXMin;
  const extendedMin = colXMin - colWidth * 0.3;
  const extendedMax = colXMax + colWidth * 0.3;

  for (const dataLine of block.dataLines) {
    for (const word of dataLine.words) {
      const wordCenter = word.x + word.width / 2;
      if (wordCenter >= extendedMin && wordCenter <= extendedMax) {
        return {
          page: dataLine.pageNum,
          institution: block.institutionLine?.fullText ?? '(desconocida)',
          paymentDueAmount: word.text,
          amountValue: parseAmount(word.text),
          confidence: 'low',
          sourceY: dataLine.y,
          sourceX: word.x,
        };
      }
    }
  }

  return null;
}

/** Fallback: extraer del valor más a la derecha de cada bloque (última columna) */
function extractFromRightmostColumn(
  blocks: CreditBlock[],
  warnings: string[],
): ExtractedPayment[] {
  const payments: ExtractedPayment[] = [];

  for (const block of blocks) {
    const institution = block.institutionLine?.fullText ?? '(desconocida)';
    let rightmostWord: WordToken | null = null;

    for (const dataLine of block.dataLines) {
      // La palabra más a la derecha que sea numérica
      const numericWords = dataLine.words.filter((w) => /^[\d,\.]+$/.test(w.text));
      if (numericWords.length > 0) {
        const lastNumeric = numericWords[numericWords.length - 1];
        if (
          !rightmostWord ||
          lastNumeric.x + lastNumeric.width >
            rightmostWord.x + rightmostWord.width
        ) {
          rightmostWord = lastNumeric;
        }
      }
    }

    if (rightmostWord) {
      payments.push({
        page: block.pageNum,
        institution,
        paymentDueAmount: rightmostWord.text,
        amountValue: parseAmount(rightmostWord.text),
        confidence: 'low',
        sourceY: rightmostWord.y,
        sourceX: rightmostWord.x,
      });
    }
  }

  if (payments.length === 0) {
    warnings.push('Fallback por columna derecha: no se encontraron valores numéricos.');
  }

  return payments;
}

function parseAmount(text: string): number | null {
  // Eliminar símbolos de moneda, espacios, y normalizar coma a punto
  const cleaned = text
    .replace(/[\$\u00A0\s]/g, '')
    .replace(/,/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

/** Palabras que probablemente NO son montos de pago (años, códigos, etc.) */
function isLikelyPaymentAmount(text: string): boolean {
  const cleaned = text.replace(/[\$,]/g, '').trim();

  // Un año de 4 dígitos (1900-2099) probablemente no es un monto
  if (/^(19|20)\d{2}$/.test(cleaned)) {
    // A menos que sea un monto grande como $2023 pesos — poco probable
    if (parseFloat(cleaned) < 10000) return false;
  }

  // Palabras que no son números
  if (!/^[\d,\.]+$/.test(cleaned)) return false;

  return true;
}

function columnDistance(word: WordToken, header: ColumnHeader): number {
  const wordCenter = word.x + word.width / 2;
  const colCenter = (header.xMin + header.xMax) / 2;
  return Math.abs(wordCenter - colCenter);
}

function columnDistanceFromStr(
  payment: ExtractedPayment,
  header: ColumnHeader,
): number {
  const colCenter = (header.xMin + header.xMax) / 2;
  return Math.abs(payment.sourceX - colCenter);
}

/** Busca la palabra más cercana al centro de la columna, con preferencia por números */
function findBestWordInColumn(
  line: TextLine,
  colXMin: number,
  colXMax: number,
): WordToken | null {
  const colCenter = (colXMin + colXMax) / 2;
  let bestNumeric: WordToken | null = null;
  let bestNumericDist = Infinity;
  let bestAny: WordToken | null = null;
  let bestAnyDist = Infinity;

  for (const word of line.words) {
    const wordCenter = word.x + word.width / 2;
    if (wordCenter >= colXMin && wordCenter <= colXMax) {
      const dist = Math.abs(wordCenter - colCenter);
      const isNumeric = /^[\d,\.]+$/.test(word.text);

      if (isNumeric && dist < bestNumericDist) {
        bestNumericDist = dist;
        bestNumeric = word;
      }
      if (dist < bestAnyDist) {
        bestAnyDist = dist;
        bestAny = word;
      }
    }
  }

  // Siempre preferir palabra numérica si existe (montos de pago son números)
  return bestNumeric ?? bestAny;
}

// ── Orquestador principal ─────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Uso: npm run extract -- <ruta-al-pdf>');
    console.error('Ejemplo: npm run extract -- samples/mi-buro.pdf');
    process.exit(1);
  }

  const pdfPath = path.resolve(args[0]);
  if (!fs.existsSync(pdfPath)) {
    console.error(`Archivo no encontrado: ${pdfPath}`);
    process.exit(1);
  }

  const pdfName = path.basename(pdfPath, path.extname(pdfPath));
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const outputDir = path.resolve(currentDir, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`\n📄 Procesando: ${pdfPath}`);
  console.log('━'.repeat(60));

  const warnings: string[] = [];

  // ── Stage 1 ──────────────────────────────────────────────────────────
  console.log('[1/5] Extrayendo palabras con coordenadas...');
  const words = await extractAllWords(pdfPath);
  console.log(`       → ${words.length} palabras extraídas`);

  // ── Stage 2 ──────────────────────────────────────────────────────────
  console.log('[2/5] Agrupando en líneas de texto...');
  const lines = groupIntoLines(words);
  const pageCount = new Set(words.map((w) => w.pageNum)).size;
  console.log(`       → ${lines.length} líneas en ${pageCount} página(s)`);

  // ── Guardar diagnóstico intermedio ───────────────────────────────────
  const diagPath = path.join(outputDir, `${pdfName}_lines_diag.json`);
  fs.writeFileSync(
    diagPath,
    JSON.stringify(
      {
        totalWords: words.length,
        totalLines: lines.length,
        totalPages: pageCount,
        sampleLines: lines.slice(0, 20).map((l) => ({
          y: l.y,
          xMin: l.xMin,
          xMax: l.xMax,
          text: l.fullText,
          page: l.pageNum,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`       → Diagnóstico guardado en: ${diagPath}`);

  // ── Stage 3 ──────────────────────────────────────────────────────────
  console.log('[3/5] Detectando encabezado "Monto a Pagar"...');
  const headerResult = findPaymentHeaders(lines, words);
  warnings.push(...headerResult.warnings);

  if (headerResult.headers.length > 0) {
    const h = headerResult.headers[0];
    console.log(
      `       → Encontrado: "${h.text}" en página ${h.pageNum}, ` +
        `columna X [${h.xMin.toFixed(0)}–${h.xMax.toFixed(0)}], Y=${h.y.toFixed(0)}`,
    );
  } else {
    console.log('       → ⚠️  No se detectó encabezado de pago');
  }

  // ── Stage 4 ──────────────────────────────────────────────────────────
  console.log('[4/5] Detectando bloques de crédito...');
  const headerPageNum =
    headerResult.headers.length > 0 ? headerResult.headers[0].pageNum : null;
  const headerY =
    headerResult.headers.length > 0 ? headerResult.headers[0].y : 0;

  const blockResult = detectCreditBlocks(lines, headerY, headerPageNum);
  warnings.push(...blockResult.warnings);
  console.log(`       → ${blockResult.blocks.length} bloques detectados`);

  for (let i = 0; i < Math.min(blockResult.blocks.length, 10); i++) {
    const b = blockResult.blocks[i];
    console.log(
      `         ${i + 1}. "${b.institutionLine?.fullText ?? '(sin nombre)'}" ` +
        `— ${b.dataLines.length} filas (pág ${b.pageNum}, Y ${b.yStart.toFixed(0)}–${b.yEnd.toFixed(0)})`,
    );
  }
  if (blockResult.blocks.length > 10) {
    console.log(`         ... y ${blockResult.blocks.length - 10} más`);
  }

  // ── Stage 5 ──────────────────────────────────────────────────────────
  console.log('[5/5] Extrayendo paymentDueAmount por bloque...');
  const paymentResult = extractPaymentAmounts(
    blockResult.blocks,
    headerResult.headers,
  );
  warnings.push(...paymentResult.warnings);

  // ── Resultados ───────────────────────────────────────────────────────────

  const report: ExtractionReport = {
    sourceFile: path.basename(pdfPath),
    totalPages: pageCount,
    totalWords: words.length,
    totalLines: lines.length,
    headersFound: headerResult.headers,
    creditBlocksDetected: blockResult.blocks.length,
    payments: paymentResult.payments,
    warnings,
  };

  console.log('\n' + '━'.repeat(60));
  console.log('📊 RESULTADOS\n');

  const found = paymentResult.payments.filter(
    (p) => p.paymentDueAmount !== 'NO_ENCONTRADO',
  );
  const notFound = paymentResult.payments.filter(
    (p) => p.paymentDueAmount === 'NO_ENCONTRADO',
  );

  console.log(`✅ ${found.length} montos extraídos`);
  console.log(`❌ ${notFound.length} no encontrados`);
  console.log(`⚠️  ${warnings.length} advertencias\n`);

  for (const p of paymentResult.payments) {
    const confIcon =
      p.confidence === 'high' ? '🟢' : p.confidence === 'medium' ? '🟡' : '🔴';
    console.log(
      `  ${confIcon} ${p.institution.padEnd(35)} ${p.paymentDueAmount.padStart(12)} ` +
        `(pág ${p.page}, Y=${p.sourceY.toFixed(0)})`,
    );
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  Advertencias:');
    for (const w of warnings) {
      console.log(`   - ${w}`);
    }
  }

  // ── Guardar resultados ───────────────────────────────────────────────────

  const jsonPath = path.join(outputDir, `${pdfName}_extraction.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\n📁 JSON: ${jsonPath}`);

  const csvPath = path.join(outputDir, `${pdfName}_extraction.csv`);
  const csvRows = [
    'page,institution,paymentDueAmount,amountValue,confidence,sourceY,sourceX',
    ...paymentResult.payments.map(
      (p) =>
        `${p.page},"${p.institution}",${p.paymentDueAmount},${p.amountValue ?? ''},${p.confidence},${p.sourceY.toFixed(1)},${p.sourceX.toFixed(1)}`,
    ),
  ];
  fs.writeFileSync(csvPath, csvRows.join('\n'));
  console.log(`📁 CSV:  ${csvPath}`);

  // ── Guardar reporte completo ─────────────────────────────────────────────
  console.log('\n✅ POC completado.');
  console.log(
    '   Revisá los archivos .json y .csv en output/ contra el PDF original.\n',
  );
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
