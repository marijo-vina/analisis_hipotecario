/**
 * ============================================================================
 * POC v3: Grilla financiera completa por coordenadas — Buró de Crédito
 *
 * Stack: pdfjs-dist (Mozilla) + Node.js/TypeScript.
 *
 * Diferencia clave vs v2: en lugar de buscar UNA columna, reconstruye TODAS
 * las columnas financieras detectando encabezados, calculando bandas X por
 * midpoint, y asignando cada palabra a su columna correcta.
 *
 * Uso: npm run extract:grid -- samples/mi-buro.pdf
 * Salida: output/<nombre>_grid.json + output/<nombre>_grid.svg
 * ============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// ── Tipos ──────────────────────────────────────────────────────────────────

interface WordToken {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageNum: number;
}

/** Header de columna detectado (puede estar partido en múltiples líneas Y) */
interface DetectedHeader {
  /** Nombre canónico (ej: 'paymentDueAmount') */
  name: string;
  /** Texto visible detectado */
  displayText: string;
  centerX: number;
  xMin: number;
  xMax: number;
  y: number;
  pageNum: number;
  /** ¿Es una columna de la que extraemos valor financiero? */
  isFinancial: boolean;
}

/** Banda X de una columna (desde midpoint izquierdo hasta midpoint derecho) */
interface ColumnBand {
  name: string;
  displayText: string;
  xMin: number;
  xMax: number;
  centerX: number;
  isFinancial: boolean;
}

/** Una celda: palabra(s) asignada(s) a una columna específica */
interface GridCell {
  columnName: string;
  text: string;
  x: number;
  y: number;
  pageNum: number;
}

/** Fila de datos en la grilla */
interface GridRow {
  y: number;
  pageNum: number;
  cells: GridCell[];
}

/** Bloque de crédito: agrupa filas que pertenecen al mismo crédito */
interface CreditBlock {
  institution: string;
  rows: GridRow[];
  pageNum: number;
  yStart: number;
  yEnd: number;
}

/** Valores financieros extraídos de un crédito */
interface FinancialValues {
  creditLimit: string;
  maxCredit: string;
  currentBalance: string;
  pastDueAmount: string;
  lastPaymentAmount: string;
  paymentDueAmount: string;
  /** Confidence for paymentDueAmount only */
  paymentConfidence: 'band_match' | 'extended' | 'rescue' | 'none';
}

interface ExtractionResult {
  sourceFile: string;
  totalPages: number;
  columnsFound: string[];
  financialColumnsFound: string[];
  credits: {
    institution: string;
    values: FinancialValues;
    rowCount: number;
  }[];
  warnings: string[];
}

// ── Constantes ─────────────────────────────────────────────────────────────

const Y_TOLERANCE = 4;
const HEADER_X_MERGE_TOLERANCE = 22; // px — más estricto para no fusionar "Cierre" con "Moneda"

/** Definición canónica de columnas que buscamos detectar */
interface ColumnDef {
  name: string;
  patterns: RegExp[];
  isFinancial: boolean;
}

const COLUMN_DEFINITIONS: ColumnDef[] = [
  {
    name: 'creditorInfo',
    patterns: [
      /otorgante/i, /no\.?\s*de\s*cuenta/i, /tipo\s*de\s*crédito/i,
      /crédito\s*\/\s*cuenta/i, /cuenta\s*\/\s*responsabilidad/i,
      /responsabilidad/i,
    ],
    isFinancial: false,
  },
  {
    name: 'openingDate',
    patterns: [/apertura/i],
    isFinancial: false,
  },
  {
    name: 'lastPaymentDate',
    // Distinguir de MONTO último pago: SIN la palabra "Monto" antes
    patterns: [/^(?!.*monto).*último\s*pago/i, /^(?!.*monto).*ultimo\s*pago/i],
    isFinancial: false,
  },
  {
    name: 'closingDate',
    patterns: [/cierre/i],
    isFinancial: false,
  },
  {
    name: 'currency',
    patterns: [/moneda/i],
    isFinancial: false,
  },
  {
    name: 'creditLimit',
    patterns: [/límite\s*de\s*crédito/i, /limite\s*de\s*credito/i],
    isFinancial: true,
  },
  {
    name: 'maxCredit',
    patterns: [/crédito\s*máximo/i, /credito\s*maximo/i],
    isFinancial: true,
  },
  {
    name: 'currentBalance',
    patterns: [/saldo\s*actual/i],
    isFinancial: true,
  },
  {
    name: 'pastDueAmount',
    // "Monto**" o "Monto **" — NO es "Monto a Pagar" ni "Monto Último Pago"
    patterns: [/monto\s*\*\*/i, /monto\*{1,2}(?!\s*(a|último|ultimo))/i],
    isFinancial: true,
  },
  {
    name: 'lastPaymentAmount',
    // "Monto Último Pago" — CONTIENE "Monto" Y "Último Pago"
    patterns: [/monto\s*último\s*pago/i, /monto\s*ultimo\s*pago/i],
    isFinancial: true,
  },
  {
    name: 'paymentDueAmount',
    // "Monto a Pagar" — LA columna objetivo
    patterns: [/monto\s*a\s*pagar/i],
    isFinancial: true,
  },
  {
    name: 'payrollLinkedInfo',
    patterns: [/crédito\s*asociado/i, /nómina/i, /nomina/i],
    isFinancial: false,
  },
  {
    name: 'paymentHistory',
    patterns: [/histórico\s*de\s*pagos/i, /historico\s*de\s*pagos/i, /clave\s*de\s*observación/i],
    isFinancial: false,
  },
];

/** Columnas financieras que extraemos */
const FINANCIAL_COLUMNS = [
  'creditLimit', 'maxCredit', 'currentBalance',
  'pastDueAmount', 'lastPaymentAmount', 'paymentDueAmount',
];

// ── Stage 1: Extraer palabras con coordenadas ─────────────────────────────

async function extractAllWords(pdfPath: string): Promise<WordToken[]> {
  const buffer = fs.readFileSync(pdfPath);
  const data = new Uint8Array(buffer).buffer;
  const doc = await pdfjsLib.getDocument({ data, disableFontFace: true }).promise;
  const allWords: WordToken[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();

    for (const item of textContent.items) {
      const ti = item as { str: string; transform: number[]; width: number; height: number };
      const text = ti.str?.trim();
      if (!text) continue;

      const x = ti.transform[4];
      const y = ti.transform[5];
      const viewport = page.getViewport({ scale: 1 });
      const yFromTop = viewport.height - y;

      allWords.push({
        text,
        x,
        y: yFromTop,
        width: ti.width,
        height: ti.height || 10,
        pageNum,
      });
    }
  }

  return allWords;
}

// ── Stage 2: Detectar TODAS las secciones de encabezados ──────────────────
// Una página puede tener múltiples tablas (bancaria + no bancaria).
// Cada "Monto a" presente es un ancla para una sección distinta.

interface HeaderSection {
  headers: DetectedHeader[];
  pageNum: number;
  /** Y donde empieza esta sección (debajo de sus headers) */
  dataYStart: number;
  /** Y donde termina (inicio de la siguiente sección, o fin de página) */
  dataYEnd: number;
}

function detectAllHeaderSections(
  words: WordToken[],
  lines: { words: WordToken[]; y: number; fullText: string; pageNum: number }[],
): { sections: HeaderSection[]; warnings: string[] } {
  const warnings: string[] = [];

  // ── Paso 1: Encontrar todas las anclas "Monto a" en cada página ──────────
  interface Anchor { pageNum: number; y: number }
  const anchors: Anchor[] = [];

  for (const line of lines) {
    if (!/monto\s*a\b/i.test(line.fullText)) continue;
    // Evitar duplicados: si ya hay un ancla en la misma página a < 80px de distancia Y, saltar
    const tooClose = anchors.some(
      (a) => a.pageNum === line.pageNum && Math.abs(a.y - line.y) < 80,
    );
    if (!tooClose) {
      anchors.push({ pageNum: line.pageNum, y: line.y });
    }
  }

  if (anchors.length === 0) {
    warnings.push('No se encontró "Monto a" en ninguna página.');
    return { sections: [], warnings };
  }

  // ── Paso 2: Para cada ancla, detectar headers en ±70px Y ─────────────────
  const sections: HeaderSection[] = [];

  for (const anchor of anchors) {
    // Extraer todas las palabras del área de headers para esta sección
    const headerWords: { text: string; x: number; y: number; width: number }[] = [];

    for (const line of lines) {
      if (line.pageNum !== anchor.pageNum) continue;
      if (Math.abs(line.y - anchor.y) > 70) continue;
      for (const w of line.words) {
        headerWords.push({ text: w.text, x: w.x, y: line.y, width: w.width });
      }
    }

    if (headerWords.length === 0) continue;

    // Agrupar palabras por X-center (±30px)
    const xGroups: { centerX: number; words: typeof headerWords }[] = [];
    const used = new Set<number>();

    for (let i = 0; i < headerWords.length; i++) {
      if (used.has(i)) continue;
      const group = [headerWords[i]];
      const cx = headerWords[i].x + headerWords[i].width / 2;

      for (let j = i + 1; j < headerWords.length; j++) {
        if (used.has(j)) continue;
        const jcx = headerWords[j].x + headerWords[j].width / 2;
        if (Math.abs(jcx - cx) < 30) {
          group.push(headerWords[j]);
          used.add(j);
        }
      }
      used.add(i);
      const avgX = group.reduce((s, w) => s + w.x + w.width / 2, 0) / group.length;
      xGroups.push({ centerX: avgX, words: group });
    }

    xGroups.sort((a, b) => a.centerX - b.centerX);

    // Match contra definiciones de columna
    const rawHeaders: DetectedHeader[] = [];

    for (const group of xGroups) {
      const sorted = [...group.words].sort((a, b) => a.y - b.y);
      const fullText = sorted.map((w) => w.text).join(' ');
      const xMin = Math.min(...sorted.map((w) => w.x));
      const xMax = Math.max(...sorted.map((w) => w.x + w.width));

      for (const def of COLUMN_DEFINITIONS) {
        for (const pattern of def.patterns) {
          if (pattern.test(fullText)) {
            rawHeaders.push({
              name: def.name,
              displayText: fullText.substring(0, 60),
              centerX: group.centerX,
              xMin, xMax,
              y: sorted[0].y,
              pageNum: anchor.pageNum,
              isFinancial: def.isFinancial,
            });
            break;
          }
        }
      }
    }

    if (rawHeaders.length >= 3) {
      // Solo aceptar secciones con al menos 3 columnas detectadas
      const dataYStart = anchor.y + 25; // datos empiezan ~25px debajo del ancla
      sections.push({
        headers: rawHeaders,
        pageNum: anchor.pageNum,
        dataYStart,
        dataYEnd: Infinity, // se ajusta abajo
      });
    }
  }

  // ── Paso 3: Ordenar secciones por página e Y, ajustar dataYEnd ───────────
  sections.sort((a, b) => a.pageNum - b.pageNum || a.dataYStart - b.dataYStart);

  for (let i = 0; i < sections.length; i++) {
    if (i < sections.length - 1 && sections[i + 1].pageNum === sections[i].pageNum) {
      // Usar el ancla Y de la siguiente sección (no dataYStart) para cortar antes de sus headers.
      const nextAnchorY = sections[i + 1].dataYStart - 25; // dataYStart = anchor.y + 25
      sections[i].dataYEnd = nextAnchorY + 10; // capturar hasta justo antes del ancla siguiente
    }
  }

  warnings.push(
    `${sections.length} sección(es) de encabezados detectadas en ` +
    `${new Set(sections.map((s) => s.pageNum)).size} página(s).`,
  );

  return { sections, warnings };
}

/** Encuentra las palabras que forman el texto coincidente dentro de una línea */
function findMatchingWords(lineWords: WordToken[], targetText: string): WordToken[] {
  // Estrategia: juntar palabras secuenciales hasta que contengan el target
  const normTarget = targetText.toLowerCase().replace(/\s+/g, ' ').replace(/[()]/g, '');

  for (let start = 0; start < lineWords.length; start++) {
    let accumulated = '';
    const candidate: WordToken[] = [];

    for (let i = start; i < lineWords.length; i++) {
      accumulated += (accumulated ? ' ' : '') + lineWords[i].text;
      candidate.push(lineWords[i]);

      const accNorm = accumulated.toLowerCase().replace(/\s+/g, ' ').replace(/[()]/g, '');
      if (accNorm.includes(normTarget)) {
        return candidate;
      }
    }
  }

  return [];
}

// ── Stage 3: Merge de headers multi-línea y deduplicación ─────────────────

function mergeHeaders(rawHeaders: DetectedHeader[]): DetectedHeader[] {
  if (rawHeaders.length === 0) return [];

  // Ordenar por centerX
  const sorted = [...rawHeaders].sort((a, b) => a.centerX - b.centerX);

  const merged: DetectedHeader[] = [];
  let currentGroup: DetectedHeader[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = currentGroup[currentGroup.length - 1];
    const curr = sorted[i];

    // ¿Misma columna lógica? → mismo nombre O centros muy cercanos
    if (
      curr.name === prev.name ||
      Math.abs(curr.centerX - prev.centerX) < HEADER_X_MERGE_TOLERANCE
    ) {
      currentGroup.push(curr);
    } else {
      merged.push(mergeGroup(currentGroup));
      currentGroup = [curr];
    }
  }
  merged.push(mergeGroup(currentGroup));

  // Segunda pasada: deduplicar columnas con mismo nombre (elegir la de centerX más confiable)
  const deduped: DetectedHeader[] = [];
  const seen = new Set<string>();

  for (const h of merged) {
    if (!seen.has(h.name)) {
      seen.add(h.name);
      deduped.push(h);
    }
  }

  return deduped;
}

function mergeGroup(group: DetectedHeader[]): DetectedHeader {
  if (group.length === 1) return group[0];

  const primary = group.find((h) => h.isFinancial) || group[0];
  return {
    ...primary,
    displayText: group.map((h) => h.displayText).join(' | '),
    xMin: Math.min(...group.map((h) => h.xMin)),
    xMax: Math.max(...group.map((h) => h.xMax)),
    centerX: group.reduce((s, h) => s + h.centerX, 0) / group.length,
    y: Math.max(...group.map((h) => h.y)), // la Y más baja
    isFinancial: group.some((h) => h.isFinancial),
  };
}

// ── Stage 4: Construir bandas X por midpoint ──────────────────────────────

function buildColumnBands(
  headers: DetectedHeader[],
  allWords: WordToken[],
  pageNum: number,
): ColumnBand[] {
  // Ordenar de izquierda a derecha
  const sorted = [...headers].sort((a, b) => a.centerX - b.centerX);

  // Encontrar los límites X de la página
  const pageWords = allWords.filter((w) => w.pageNum === pageNum);
  const pageXMin = Math.min(...pageWords.map((w) => w.x));
  const pageXMax = Math.max(...pageWords.map((w) => w.x + w.width));

  const bands: ColumnBand[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const leftBoundary =
      i === 0
        ? pageXMin
        : (sorted[i - 1].centerX + sorted[i].centerX) / 2;

    const rightBoundary =
      i === sorted.length - 1
        ? pageXMax
        : (sorted[i].centerX + sorted[i + 1].centerX) / 2;

    bands.push({
      name: sorted[i].name,
      displayText: sorted[i].displayText,
      xMin: leftBoundary,
      xMax: rightBoundary,
      centerX: sorted[i].centerX,
      isFinancial: sorted[i].isFinancial,
    });
  }

  return bands;
}

// ── Stage 5: Procesar filas de datos y asignar a columnas ─────────────────

function processDataRows(
  words: WordToken[],
  bands: ColumnBand[],
  pageNum: number,
  yStart: number,
  yEnd: number,
): GridRow[] {
  // Filtrar palabras dentro del rango Y de esta sección
  const dataWords = words.filter(
    (w) =>
      w.pageNum === pageNum &&
      w.y > yStart &&
      (yEnd === Infinity || w.y < yEnd),
  );

  // Agrupar por Y
  const sorted = [...dataWords].sort((a, b) => a.y - b.y || a.x - b.x);
  const lineGroups: WordToken[][] = [];
  let currentGroup: WordToken[] = [];
  let currentY = sorted.length > 0 ? sorted[0].y : 0;

  for (const w of sorted) {
    if (Math.abs(w.y - currentY) > Y_TOLERANCE) {
      if (currentGroup.length > 0) lineGroups.push(currentGroup);
      currentGroup = [w];
      currentY = w.y;
    } else {
      currentGroup.push(w);
    }
  }
  if (currentGroup.length > 0) lineGroups.push(currentGroup);

  // Para cada línea, asignar palabras a columnas
  const rows: GridRow[] = [];

  for (const group of lineGroups) {
    const cells: GridCell[] = [];

    for (const word of group) {
      const wordCenter = word.x + word.width / 2;

      // Encontrar la banda que contiene este centro
      for (const band of bands) {
        if (wordCenter >= band.xMin && wordCenter <= band.xMax) {
          const existing = cells.find((c) => c.columnName === band.name);

          if (band.isFinancial) {
            // Columnas financieras: NUNCA concatenar. Si ya hay una celda,
            // solo reemplazar si la nueva palabra es numérica (la vieja era texto).
            if (existing) {
              const newIsNumeric = /^[\d,\.]+$/.test(word.text);
              const oldIsNumeric = /^[\d,\.]+$/.test(existing.text);
              if (newIsNumeric && !oldIsNumeric) {
                existing.text = word.text;
              }
              // si ambas numéricas o ambas texto, mantener la primera
            } else {
              cells.push({
                columnName: band.name,
                text: word.text,
                x: word.x,
                y: word.y,
                pageNum: word.pageNum,
              });
            }
          } else {
            // Columnas no financieras: concatenar texto no numérico
            if (existing) {
              if (!/^[\d,\.]+$/.test(word.text)) {
                existing.text += ' ' + word.text;
              }
            } else {
              cells.push({
                columnName: band.name,
                text: word.text,
                x: word.x,
                y: word.y,
                pageNum: word.pageNum,
              });
            }
          }
          break;
        }
      }
    }

    rows.push({
      y: currentY,
      pageNum: pageNum,
      cells,
    });
    currentY = group[0].y;
  }

  return rows;
}

// ── Stage 6: Agrupar filas en bloques de crédito ──────────────────────────

function groupIntoCreditBlocks(rows: GridRow[]): CreditBlock[] {
  // ── Estrategia: usar numeración de crédito (1., 2., 3.) como delimitador ─
  // Los PDFs de buró numeran los créditos. Cada "N." en creditorInfo es un
  // nuevo bloque. Entre bloques, las filas pertenecen al bloque anterior.

  const blocks: CreditBlock[] = [];
  let currentBlock: CreditBlock | null = null;
  let currentInstitution = '';

  for (const row of rows) {
    const creditorCell = row.cells.find((c) => c.columnName === 'creditorInfo');
    const creditorText = creditorCell?.text?.trim() || '';

    // ── ¿Es nombre de institución conocida? ──────────────────────────────
    const isKnownInstitution = /santander|sofom|inbursa|telcel|telmex|gribma|mercado credito|nu mexico|nu bn|banamex|banorte|bbva|hsbc|amex|scotiabank/i.test(creditorText);

    if (isKnownInstitution) {

      // Cerrar bloque anterior
      if (currentBlock && currentBlock.rows.length > 0) {
        blocks.push(currentBlock);
      }
      // Iniciar nuevo bloque
      currentBlock = {
        institution: creditorText,
        rows: [row],
        pageNum: row.pageNum,
        yStart: row.y,
        yEnd: row.y,
      };
      currentInstitution = creditorText;
      continue;
    }

    // ── ¿Es nombre de institución? Palabras en creditorInfo que NO son descriptores ──
    const nonInstitutionWords = [
      'pagos fijos', 'revolvente', 'individual', 'mensual', 'sin límite',
      'pago mínimo', 'no aplica', 'cuenta cancelada', 'al corriente',
      'documento sin valor', 'crédito simple', 'tarjeta de crédito',
      'línea de crédito', 'linea de credito', 'sin límite pre',
      'sin limite pre', 'cuentas', 'ntes', 'ca=cuenta',
      'cc=cuenta', 'cl=cta', 'para', 'apoze',
      'compra de automóvil', 'compra de automovil', 'establecido',
      'pago', 'mínimo', 'revolve',
      'otorgante', 'de crédito / cuenta', 'de credito / cuenta',
    ];
    const lowerCreditor = creditorText.toLowerCase();
    const isDescriptor = nonInstitutionWords.some(
      (w) => lowerCreditor === w || lowerCreditor.startsWith(w),
    );

    const looksLikeInstitution =
      creditorText.length > 2 &&
      !/^[\d\s\-\.]+$/.test(creditorText) &&
      !/^\d{6,}$/.test(creditorText) &&
      !isDescriptor;

    // Actualizar nombre de institución (primero que aparezca después del número gana)
    if (looksLikeInstitution && !currentInstitution) {
      currentInstitution = creditorText;
      if (currentBlock) {
        currentBlock.institution = creditorText;
      }
    }

    // Agregar fila al bloque actual
    if (currentBlock) {
      currentBlock.rows.push(row);
      currentBlock.yEnd = row.y;
    }
  }

  // Cerrar último bloque
  if (currentBlock && currentBlock.rows.length > 0) {
    blocks.push(currentBlock);
  }

  // Post-procesar: nombrar bloques sin institución detectable
  for (const b of blocks) {
    if (!b.institution) {
      // Buscar el primer texto no-numérico en creditorInfo como nombre
      for (const r of b.rows) {
        const c = r.cells.find((x) => x.columnName === 'creditorInfo');
        if (c && c.text.length > 2 && !/^[\d\s\-\.]+$/.test(c.text)) {
          b.institution = c.text.substring(0, 50);
          break;
        }
      }
      if (!b.institution) b.institution = `Crédito #${b.rows[0]?.cells.find((x) => x.columnName === 'creditorInfo')?.text || '?'}`;
    }
  }

  return blocks;
}

// ── Stage 7: Extraer valores financieros por bloque ───────────────────────

function extractFinancialValues(
  block: CreditBlock,
  bands: ColumnBand[],
  warnings: string[],
): FinancialValues {
  const values: FinancialValues = {
    creditLimit: '',
    maxCredit: '',
    currentBalance: '',
    pastDueAmount: '',
    lastPaymentAmount: '',
    paymentDueAmount: '',
    paymentConfidence: 'none',
  };

  const pdBand = bands.find((b) => b.name === 'paymentDueAmount');
  const lpBand = bands.find((b) => b.name === 'lastPaymentAmount');

  // ── Paso 1: Extracción normal por banda ────────────────────────────────
  for (const col of FINANCIAL_COLUMNS) {
    let bestCell: GridCell | null = null;

    for (const row of block.rows) {
      const cell = row.cells.find((c) => c.columnName === col);
      if (!cell || !cell.text.trim()) continue;

      const isNumeric = /^[\d,\.]+$/.test(cell.text.trim());

      if (col === 'paymentDueAmount') {
        if (isNumeric && !bestCell) {
          bestCell = cell;
          values.paymentConfidence = 'band_match';
          break;
        }
      } else {
        if (!bestCell) {
          bestCell = cell;
        } else if (isNumeric && !/^[\d,\.]+$/.test(bestCell.text.trim())) {
          bestCell = cell;
        }
      }
    }

    if (bestCell) {
      (values as Record<string, string>)[col] = bestCell.text.trim();
    }
  }

  // ── Paso 2: Rescate conservador para paymentDueAmount ───────────────────
  // Solo si quedó vacío Y hay bandas definidas para paymentDueAmount y lastPaymentAmount.
  if (!values.paymentDueAmount && pdBand && lpBand) {
    const boundaryZoneMin = lpBand.xMax - 15;  // 503
    const boundaryZoneMax = pdBand.xMin + 30;  // 548 (pdBand widened, but xMin unchanged)
    const pdCenter = (pdBand.xMin + pdBand.xMax) / 2;
    const lpCenter = (lpBand.xMin + lpBand.xMax) / 2;

    let bestRescue: { word: WordToken; distToPd: number; distToLp: number } | null = null;

    for (const row of block.rows) {
      // Buscar en TODAS las celdas de la fila, no solo en paymentDueAmount
      for (const cell of row.cells) {
        if (cell.columnName === 'lastPaymentAmount') continue; // no robar de lastPaymentAmount

        const wordX = cell.x + (cell.text.length * 4); // estimar centro aproximado
        if (wordX < boundaryZoneMin || wordX > boundaryZoneMax) continue;

        const isNumeric = /^[\d,\.]+$/.test(cell.text.trim());
        if (!isNumeric) continue;

        const distToPd = Math.abs(wordX - pdCenter);
        const distToLp = Math.abs(wordX - lpCenter);

        // Solo rescatar si está VISIBLEMENTE más cerca de paymentDueAmount
        if (distToPd >= distToLp * 0.9) continue;

        // Solo si el lastPaymentAmount del bloque NO compite
        if (values.lastPaymentAmount && distToLp < distToPd * 1.2) continue;

        if (!bestRescue || distToPd < bestRescue.distToPd) {
          bestRescue = { word: { text: cell.text, x: cell.x, y: cell.y, width: 10, height: 10, pageNum: cell.pageNum }, distToPd, distToLp };
        }
      }
    }

    if (bestRescue) {
      values.paymentDueAmount = bestRescue.word.text;
      values.paymentConfidence = 'rescue';
    }
  }

  // ── Validación ──────────────────────────────────────────────────────────
  if (!values.paymentDueAmount || !/^[\d,\.]+$/.test(values.paymentDueAmount)) {
    if (values.paymentConfidence !== 'none') {
      values.paymentDueAmount = '';
      values.paymentConfidence = 'none';
    }
  }

  return values;
}

// ── Stage 8: Generar SVG de debug ─────────────────────────────────────────

function generateDebugSvg(
  bands: ColumnBand[],
  blocks: CreditBlock[],
  allWords: WordToken[],
  headerPageNum: number,
  headerBottomY: number,
  outputPath: string,
): void {
  const pageWords = allWords.filter((w) => w.pageNum === headerPageNum && w.y > headerBottomY - 50);
  if (pageWords.length === 0) return;

  const xMin = Math.min(...pageWords.map((w) => w.x)) - 10;
  const xMax = Math.max(...pageWords.map((w) => w.x + w.width)) + 10;
  const yMin = headerBottomY - 60;
  const yMax = Math.max(...pageWords.map((w) => w.y)) + 20;
  const svgW = xMax - xMin + 40;
  const svgH = yMax - yMin + 40;

  const COLORS = [
    '#e8f4f8', '#f0f0e8', '#f8e8f4', '#e8f8e8', '#f4f0e8',
    '#e8e8f8', '#f8f4e8', '#e8f8f4', '#f0e8f4', '#f8e8e8',
  ];

  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="${xMin - 20} ${yMin - 20} ${svgW} ${svgH}" font-family="monospace" font-size="9">\n`;
  svg += `<rect x="${xMin - 20}" y="${yMin - 20}" width="${svgW}" height="${svgH}" fill="white"/>\n`;

  // Capa 1: Bandas de columnas (fondo)
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    const color = b.isFinancial ? COLORS[i % COLORS.length] : '#fafafa';
    svg += `<rect x="${b.xMin}" y="${yMin}" width="${b.xMax - b.xMin}" height="${yMax - yMin}" fill="${color}" stroke="#ccc" stroke-width="0.5" opacity="0.5"/>\n`;

    // Nombre de columna arriba
    const labelY = yMin + 10 + (i % 3) * 12;
    svg += `<text x="${b.centerX}" y="${labelY}" text-anchor="middle" fill="${b.isFinancial ? '#c00' : '#666'}" font-size="7" transform="rotate(-30,${b.centerX},${labelY})">${b.displayText.substring(0, 20)}</text>\n`;
  }

  // Capa 2: Bloques de crédito (bandas horizontales)
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.rows.length === 0) continue;
    const blockY1 = b.rows[0].y - 2;
    const blockY2 = b.rows[b.rows.length - 1].y + 12;
    const alpha = i % 2 === 0 ? '0.08' : '0.04';
    svg += `<rect x="${xMin}" y="${blockY1}" width="${xMax - xMin}" height="${blockY2 - blockY1}" fill="blue" opacity="${alpha}"/>\n`;
    svg += `<text x="${xMin + 5}" y="${blockY1 + 10}" fill="blue" font-size="8" font-weight="bold">${b.institution.substring(0, 40)}</text>\n`;
  }

  // Capa 3: Cada palabra en su posición real
  for (const w of pageWords) {
    const isFinancial = bands.some(
      (b) => b.isFinancial && (w.x + w.width / 2) >= b.xMin && (w.x + w.width / 2) <= b.xMax,
    );
    const color = isFinancial ? '#c00' : '#333';
    svg += `<text x="${w.x}" y="${w.y}" fill="${color}" font-size="8">${escapeXml(w.text)}</text>\n`;
  }

  // Capa 4: Líneas divisorias de banda
  for (const b of bands) {
    svg += `<line x1="${b.xMin}" y1="${yMin}" x2="${b.xMin}" y2="${yMax}" stroke="#999" stroke-width="0.3" stroke-dasharray="2,2"/>\n`;
  }

  svg += `</svg>`;
  fs.writeFileSync(outputPath, svg);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Orquestador principal ─────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Uso: npm run extract:grid -- <ruta-al-pdf>');
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
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  console.log(`\n📄 Procesando: ${pdfPath}`);
  console.log('━'.repeat(60));

  // Stage 1
  console.log('[1/6] Extrayendo palabras con coordenadas...');
  const words = await extractAllWords(pdfPath);
  const pageCount = new Set(words.map((w) => w.pageNum)).size;
  console.log(`       → ${words.length} palabras en ${pageCount} páginas`);

  // Agrupar en líneas para detección de headers
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: { words: WordToken[]; y: number; fullText: string; pageNum: number }[] = [];
  let curGroup: WordToken[] = [];
  let curY = sorted.length > 0 ? sorted[0].y : 0;
  let curPage = sorted.length > 0 ? sorted[0].pageNum : 1;
  for (const w of sorted) {
    if (w.pageNum !== curPage || Math.abs(w.y - curY) > Y_TOLERANCE) {
      if (curGroup.length > 0) lines.push({ words: curGroup, y: curY, fullText: curGroup.map((x) => x.text).join(' '), pageNum: curPage });
      curGroup = [w]; curY = w.y; curPage = w.pageNum;
    } else { curGroup.push(w); }
  }
  if (curGroup.length > 0) lines.push({ words: curGroup, y: curY, fullText: curGroup.map((x) => x.text).join(' '), pageNum: curPage });

  // Stage 2
  console.log('[2/6] Detectando secciones de encabezados...');
  const sectionResult = detectAllHeaderSections(words, lines);
  const warnings: string[] = [...sectionResult.warnings];

  if (sectionResult.sections.length === 0) {
    console.log('       → ❌ No se detectaron secciones de encabezados. Abortando.');
    process.exit(1);
  }
  console.log(`       → ${sectionResult.sections.length} sección(es) detectada(s)`);

  // ── Procesar cada sección independientemente ──────────────────────────
  const allCredits: { institution: string; values: FinancialValues; rowCount: number }[] = [];
  let totalRows = 0;
  let allColumns: string[] = [];
  let allFinancialColumns: string[] = [];

  for (let si = 0; si < sectionResult.sections.length; si++) {
    const section = sectionResult.sections[si];
    console.log(`\n   ── Sección ${si + 1}: pág ${section.pageNum}, Y ${section.dataYStart.toFixed(0)}–${section.dataYEnd === Infinity ? 'fin' : section.dataYEnd.toFixed(0)} ──`);

    // Stage 3: Merge headers
    const merged = mergeHeaders(section.headers);
    console.log(`       → ${merged.length} columnas después del merge`);
    for (const h of merged) {
      console.log(`         ${h.isFinancial ? '💰' : '📋'} ${h.name.padEnd(22)} X=${h.centerX.toFixed(0)}`);
    }

    // Stage 4: Build bands (widen paymentDueAmount 20px right for v3.1)
    const bands = buildColumnBands(merged, words, section.pageNum);
    const pdBand = bands.find((b) => b.name === 'paymentDueAmount');
    if (pdBand) pdBand.xMax += 20;
    console.log(`       → Bandas:`);
    for (const b of bands) {
      if (b.isFinancial) {
        console.log(`         💰 ${b.name.padEnd(22)} [${b.xMin.toFixed(0)}–${b.xMax.toFixed(0)}]`);
      }
    }

    // Stage 5: Process data rows for this section
    const rows = processDataRows(words, bands, section.pageNum, section.dataYStart, section.dataYEnd);
    console.log(`       → ${rows.length} filas de datos`);

    const blocks = groupIntoCreditBlocks(rows);
    console.log(`       → ${blocks.length} bloques de crédito`);

    // Extract values for this section's blocks (bands are section-specific)
    for (const block of blocks) {
      const values = extractFinancialValues(block, bands, warnings);
      allCredits.push({
        institution: block.institution,
        values,
        rowCount: block.rows.length,
      });
    }

    totalRows += rows.length;
    allColumns = [...new Set([...allColumns, ...merged.map((h) => h.name)])];
    allFinancialColumns = [...new Set([...allFinancialColumns, ...merged.filter((h) => h.isFinancial).map((h) => h.name)])];
  }

  // Stage 6: Display results
  console.log(`\n[6/6] Extrayendo valores financieros (${allCredits.length} créditos)...\n`);

  const results: ExtractionResult = {
    sourceFile: path.basename(pdfPath),
    totalPages: pageCount,
    columnsFound: allColumns,
    financialColumnsFound: allFinancialColumns,
    credits: allCredits,
    warnings,
  };

  for (const credit of allCredits) {
    const v = credit.values;
    const conf = v.paymentConfidence === 'rescue' ? ' 🔄' : v.paymentConfidence === 'band_match' ? '' : ' ⚠️';
    console.log(`🏦 ${credit.institution.substring(0, 45)}`);
    console.log(`   paymentDueAmount:   ${v.paymentDueAmount || '(vacío)'}${conf}`);
    console.log(`   pastDueAmount:      ${v.pastDueAmount || '(vacío)'}`);
    console.log(`   lastPaymentAmount:  ${v.lastPaymentAmount || '(vacío)'}`);
    console.log(`   currentBalance:     ${v.currentBalance || '(vacío)'}`);
    console.log(`   creditLimit:        ${v.creditLimit || '(vacío)'}`);
    console.log(`   maxCredit:          ${v.maxCredit || '(vacío)'}`);
    console.log(`   filas: ${credit.rowCount}`);
    console.log('');
  }

  // ── SVG debug ────────────────────────────────────────────────────────────
  const svgPage = sectionResult.sections[0].pageNum;
  const svgSection = sectionResult.sections[0];
  const svgMerged = mergeHeaders(svgSection.headers);
  const svgBands = buildColumnBands(svgMerged, words, svgPage);
  const pdSvgBand = svgBands.find((b) => b.name === 'paymentDueAmount');
  if (pdSvgBand) pdSvgBand.xMax += 20;
  const svgPath = path.join(outputDir, `${pdfName}_grid.svg`);

  // Regenerate all blocks for SVG (first section only, for visual reference)
  const svgRows = processDataRows(words, svgBands, svgSection.pageNum, svgSection.dataYStart, svgSection.dataYEnd);
  const svgBlocks = groupIntoCreditBlocks(svgRows);
  generateDebugSvg(svgBands, svgBlocks, words, svgPage, svgSection.dataYStart, svgPath);
  console.log(`📁 SVG debug: ${svgPath}`);

  // ── JSON ─────────────────────────────────────────────────────────────────
  const jsonPath = path.join(outputDir, `${pdfName}_grid.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`📁 JSON: ${jsonPath}`);

  console.log('\n✅ POC v3 completado.');
  console.log('   Abrí el SVG en un navegador para verificar bandas, bloques y valores.\n');
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
