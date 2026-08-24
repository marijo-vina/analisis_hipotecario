import { OcrLayout, OcrPage, OcrLine } from './document-ai.types';
import { RawTransaction } from './bank-statement-cleaner.service';

export interface GridExtractionOptions {
  depositHeaderPatterns?: RegExp[];
  withdrawalHeaderPatterns?: RegExp[];
  balanceHeaderPatterns?: RegExp[];
  dateHeaderPatterns?: RegExp[];
  conceptHeaderPatterns?: RegExp[];
}

/** Per-page diagnostics for the deterministic grid extraction (observability only). */
export interface GridPageDiagnostics {
  /** 1-based page number. */
  pageNumber: number;
  /** Total OCR lines on the page. */
  lineCount: number;
  /** Whether a deposit column header was located in the upper band. */
  depositHeaderFound: boolean;
  /** Whether the page reused column bounds from a previous transaction page. */
  depositHeaderInherited: boolean;
  /** Whether a withdrawal column header was located. */
  withdrawalHeaderFound: boolean;
  /** Whether a balance column header was located. */
  balanceHeaderFound: boolean;
  /** Raw matched header text (as OCR'd, before uppercasing). null if none. */
  depositHeaderText: string | null;
  /** True when the deposit header text carried an accent (e.g. DEPÓSITOS). */
  depositHeaderHadAccent: boolean;
  /** Number of numeric deposit cells captured within the column band. */
  depositCellCount: number;
  /** Number of transactions emitted for this page. */
  transactionCount: number;
}

/** Aggregate diagnostics across all pages of a statement. */
export interface GridDiagnostics {
  pageCount: number;
  pagesWithDepositHeader: number;
  totalDepositCells: number;
  totalTransactions: number;
  pages: GridPageDiagnostics[];
}

export interface GridExtractionOutput {
  transactions: RawTransaction[];
  diagnostics: GridDiagnostics;
}

/** Detects a Spanish accent anywhere in a header token. */
const ACCENT_REGEX = /[ÁÉÍÓÚÑáéíóúñ]/;
const DATE_LINE_PATTERN = /^\d{1,2}\s+(?:ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\b/i;
const BBVA_DATE_LINE_PATTERN = /^\d{1,2}\/(?:ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\b/i;
const CURRENCY_AMOUNT_PATTERN = /^\$?[\d,]+\.\d{2}$/;
const CURRENCY_AMOUNT_GLOBAL_PATTERN = /\$?[\d,]+\.\d{2}/g;
const COMBINED_MOVEMENT_HEADER_PATTERN = /CARGOS.*ABONOS|ABONOS.*CARGOS/i;

interface ColumnContext {
  depLeft: number;
  depRight: number;
  withdrawalLeft: number;
}

const DEFAULT_OPTIONS: GridExtractionOptions = {
  depositHeaderPatterns: [/DEPOSITOS|ABONOS|DEPOSITOS\s*\(\+\)|CREDITOS/i],
  withdrawalHeaderPatterns: [/RETIROS|CARGOS|CARGOS\s*\(\-\)|DEBITOS/i],
  balanceHeaderPatterns: [/^SALDO$|^SALDO\s+OPERACION/i],
  dateHeaderPatterns: [/^FECHA$/i],
  conceptHeaderPatterns: [/^CONCEPTO$|^DESCRIPCION/i],
};

const MONTH_MAP: Record<string, string> = {
  ENE: '01',
  FEB: '02',
  MAR: '03',
  ABR: '04',
  MAY: '05',
  JUN: '06',
  JUL: '07',
  AGO: '08',
  SEP: '09',
  OCT: '10',
  NOV: '11',
  DIC: '12',
};

export class BankStatementGridExtractor {
  /**
   * Extracts deposit transactions deterministically from OCR layout bounding boxes.
   */
  static extractTransactions(
    layout: OcrLayout,
    statementYear?: string | number,
    options: GridExtractionOptions = DEFAULT_OPTIONS,
  ): RawTransaction[] {
    return this.extractWithDiagnostics(layout, statementYear, options)
      .transactions;
  }

  /**
   * Same as `extractTransactions` but also returns per-page diagnostics
   * describing header detection. Used by the observability/benchmark path
   * to explain why a page yielded zero transactions. No behavior change:
   * `extractTransactions` delegates here and returns only the transactions.
   */
  static extractWithDiagnostics(
    layout: OcrLayout,
    statementYear?: string | number,
    options: GridExtractionOptions = DEFAULT_OPTIONS,
  ): GridExtractionOutput {
    const emptyDiagnostics: GridDiagnostics = {
      pageCount: 0,
      pagesWithDepositHeader: 0,
      totalDepositCells: 0,
      totalTransactions: 0,
      pages: [],
    };

    if (!layout || !Array.isArray(layout.pages) || layout.pages.length === 0) {
      return { transactions: [], diagnostics: emptyDiagnostics };
    }

    const yearStr = statementYear ? String(statementYear) : new Date().getFullYear().toString();
    const transactions: RawTransaction[] = [];
    const pageDiagnostics: GridPageDiagnostics[] = [];
    let carryForwardContext: ColumnContext | null = null;

    for (let pIdx = 0; pIdx < layout.pages.length; pIdx++) {
      const page = layout.pages[pIdx];
      const {
        transactions: pageTransactions,
        diagnostics,
        columnContext,
      } = this.extractPageTransactions(
        page,
        yearStr,
        options,
        carryForwardContext,
      );
      transactions.push(...pageTransactions);
      pageDiagnostics.push(diagnostics);
      if (columnContext) {
        carryForwardContext = columnContext;
      } else if (pageTransactions.length === 0 && !diagnostics.depositHeaderInherited) {
        carryForwardContext = null;
      }
    }

    const diagnostics: GridDiagnostics = {
      pageCount: pageDiagnostics.length,
      pagesWithDepositHeader: pageDiagnostics.filter((p) => p.depositHeaderFound)
        .length,
      totalDepositCells: pageDiagnostics.reduce(
        (sum, p) => sum + p.depositCellCount,
        0,
      ),
      totalTransactions: transactions.length,
      pages: pageDiagnostics,
    };

    return { transactions, diagnostics };
  }

  private static extractPageTransactions(
    page: OcrPage,
    yearStr: string,
    options: GridExtractionOptions,
    previousContext: ColumnContext | null = null,
  ): {
    transactions: RawTransaction[];
    diagnostics: GridPageDiagnostics;
    columnContext: ColumnContext | null;
  } {
    const lines = page.lines || [];
    const diagnostics: GridPageDiagnostics = {
      pageNumber: page.pageNumber,
      lineCount: lines.length,
      depositHeaderFound: false,
      depositHeaderInherited: false,
      withdrawalHeaderFound: false,
      balanceHeaderFound: false,
      depositHeaderText: null,
      depositHeaderHadAccent: false,
      depositCellCount: 0,
      transactionCount: 0,
    };

    if (lines.length === 0) {
      return { transactions: [], diagnostics, columnContext: null };
    }

    // 1. Locate column headers
    let depositHeader: OcrLine['boundingBox'] | null = null;
    let withdrawalHeader: OcrLine['boundingBox'] | null = null;
    let balanceHeader: OcrLine['boundingBox'] | null = null;

    const depositPatterns = options.depositHeaderPatterns || DEFAULT_OPTIONS.depositHeaderPatterns!;
    const withdrawalPatterns = options.withdrawalHeaderPatterns || DEFAULT_OPTIONS.withdrawalHeaderPatterns!;
    const balancePatterns = options.balanceHeaderPatterns || DEFAULT_OPTIONS.balanceHeaderPatterns!;

    for (const line of lines) {
      const rawText = line.text.trim();
      const text = rawText.toUpperCase();
      const box = line.boundingBox;
      if (COMBINED_MOVEMENT_HEADER_PATTERN.test(text)) {
        const synthesized = this.synthesizeCombinedHeaderBoxes(box);
        withdrawalHeader = synthesized.withdrawalHeader;
        depositHeader = synthesized.depositHeader;
        balanceHeader = synthesized.balanceHeader;
        diagnostics.depositHeaderFound = true;
        diagnostics.depositHeaderText = rawText;
        diagnostics.depositHeaderHadAccent = ACCENT_REGEX.test(rawText);
        diagnostics.withdrawalHeaderFound = true;
        diagnostics.balanceHeaderFound = true;
        continue;
      }

      // Headers typically reside in the upper 45% of the page
      if (box.top > page.height * 0.45) continue;

      if (depositPatterns.some((p) => p.test(text))) {
        depositHeader = box;
        diagnostics.depositHeaderFound = true;
        diagnostics.depositHeaderText = rawText;
        diagnostics.depositHeaderHadAccent = ACCENT_REGEX.test(rawText);
      } else if (withdrawalPatterns.some((p) => p.test(text))) {
        withdrawalHeader = box;
        diagnostics.withdrawalHeaderFound = true;
      } else if (balancePatterns.some((p) => p.test(text))) {
        balanceHeader = box;
        diagnostics.balanceHeaderFound = true;
      }
    }

    const pageHasTransactionDates = lines.some((line) =>
      this.isTransactionDateLine(line.text.trim()),
    );
    const canInheritHeader =
      !depositHeader && previousContext && pageHasTransactionDates;

    if (!depositHeader && !canInheritHeader) {
      // Non-transaction page (e.g. cover page, legal terms, etc.)
      return { transactions: [], diagnostics, columnContext: null };
    }

    diagnostics.depositHeaderInherited = Boolean(canInheritHeader);

    // 2. Compute dynamic X-boundaries for deposit column. Continuation pages
    // sometimes omit headers, so reuse the latest known transaction columns.
    const columnContext: ColumnContext = canInheritHeader
      ? previousContext!
      : {
          depLeft: withdrawalHeader
            ? (withdrawalHeader.right + depositHeader!.left) / 2
            : depositHeader!.left - 40,
          depRight: balanceHeader
            ? (depositHeader!.right + balanceHeader.left) / 2
            : depositHeader!.right + 60,
          withdrawalLeft: withdrawalHeader
            ? withdrawalHeader.left
            : depositHeader!.left - 40,
        };

    const depLeft = columnContext.depLeft;
    const depRight = columnContext.depRight;
    const withdrawalLeft = columnContext.withdrawalLeft;
    const tableTop = canInheritHeader ? 0 : depositHeader!.bottom + 5;

    // 3. Collect numeric deposit amounts within the column band
    interface DepositCell {
      amount: number;
      top: number;
      bottom: number;
    }

    const depositCells: DepositCell[] = [];
    for (const line of lines) {
      const box = line.boundingBox;
      if (box.top <= tableTop) continue;

      const centerX = (box.left + box.right) / 2;
      const text = line.text.trim();
      const amountText = this.extractDepositAmountText(
        text,
        box,
        depLeft,
        depRight,
        centerX,
      );
      if (amountText) {
        const amt = this.parseAmount(amountText);
        if (amt !== null && amt > 0) {
          depositCells.push({
            amount: amt,
            top: box.top,
            bottom: box.bottom,
          });
        }
      }
    }

    diagnostics.depositCellCount = depositCells.length;

    // Sort deposits top-to-bottom
    depositCells.sort((a, b) => a.top - b.top);

    // 4. Associate concept block and date for each deposit
    //    Strategy: for each deposit amount, scan BACKWARD through left-column
    //    lines to find the nearest date line (DD MMM pattern). This eliminates
    //    withdrawal concepts that sit between consecutive deposits.
    const pageTransactions: RawTransaction[] = [];
    let lastKnownDate: string | null = null;

    for (let i = 0; i < depositCells.length; i++) {
      const current = depositCells[i];
      const prev = i > 0 ? depositCells[i - 1] : null;

      // Safe floor: previous deposit bottom or table top
      const safeFloor = prev ? prev.bottom : tableTop;
      const blockBottom = current.bottom + 15;

      // Collect ALL left-column candidate lines in the full Y range
      const candidateLines = lines.filter((l) => {
        const b = l.boundingBox;
        const isLeftOfAmounts = b.right < withdrawalLeft;
        return isLeftOfAmounts && b.top >= safeFloor && b.bottom <= blockBottom && b.top > tableTop;
      });
      candidateLines.sort((a, b) => a.boundingBox.top - b.boundingBox.top);

      // Find the deposit's own date line by scanning BACKWARD from the amount
      // position. The first date line found going upward is the start of this
      // deposit's concept block; everything above belongs to withdrawals.
      let dateLineIndex = -1;
      for (let j = candidateLines.length - 1; j >= 0; j--) {
        if (this.isTransactionDateLine(candidateLines[j].text.trim())) {
          dateLineIndex = j;
          break;
        }
      }

      // Use only lines from the deposit's date line to the end;
      // fallback to all candidates if no date line found (rare edge case).
      const blockLines = dateLineIndex >= 0
        ? candidateLines.slice(dateLineIndex)
        : candidateLines;
      const rawConcept = blockLines.map((l) => l.text.trim()).join(' ');

      // Parse date
      const date = this.extractDate(rawConcept, yearStr) || lastKnownDate;
      if (date) {
        lastKnownDate = date;
      }

      // Clean up concept (remove leading date and technical markers)
      const cleanedConcept = this.cleanConceptText(rawConcept);

      // Extract payer name / RFC if identifiable
      const { payerName, payerRfc } = this.extractPayerDetails(rawConcept);

      pageTransactions.push({
        date,
        amount: current.amount,
        currency: 'MXN',
        movementType: 'DEPOSIT',
        originalConcept: cleanedConcept || rawConcept || 'DEPOSITO',
        payerOrBeneficiaryName: payerName,
        payerRfc,
      });
    }

    diagnostics.transactionCount = pageTransactions.length;

    return { transactions: pageTransactions, diagnostics, columnContext };
  }

  private static parseAmount(text: string): number | null {
    const clean = text.replace(/[$,\s]/g, '');
    const val = parseFloat(clean);
    return isNaN(val) ? null : val;
  }

  private static synthesizeCombinedHeaderBoxes(
    box: OcrLine['boundingBox'],
  ): {
    withdrawalHeader: OcrLine['boundingBox'];
    depositHeader: OcrLine['boundingBox'];
    balanceHeader: OcrLine['boundingBox'];
  } {
    const width = box.right - box.left;
    return {
      withdrawalHeader: {
        top: box.top,
        bottom: box.bottom,
        left: box.left + width * 0.28,
        right: box.left + width * 0.48,
      },
      depositHeader: {
        top: box.top,
        bottom: box.bottom,
        left: box.left + width * 0.52,
        right: box.left + width * 0.68,
      },
      balanceHeader: {
        top: box.top,
        bottom: box.bottom,
        left: box.left + width * 0.78,
        right: box.right,
      },
    };
  }

  private static extractDepositAmountText(
    text: string,
    box: OcrLine['boundingBox'],
    depLeft: number,
    depRight: number,
    centerX: number,
  ): string | null {
    if (centerX >= depLeft && centerX <= depRight && CURRENCY_AMOUNT_PATTERN.test(text)) {
      return text;
    }

    const overlapsDepositColumn = box.right >= depLeft && box.left <= depRight;
    if (!overlapsDepositColumn) return null;

    const amountMatches = Array.from(text.matchAll(CURRENCY_AMOUNT_GLOBAL_PATTERN));
    if (amountMatches.length <= 1) return null;

    return amountMatches[0][0];
  }

  private static isTransactionDateLine(text: string): boolean {
    return DATE_LINE_PATTERN.test(text) || BBVA_DATE_LINE_PATTERN.test(text);
  }

  private static extractDate(text: string, defaultYear: string): string | null {
    // 1. Check all "DD MMM" occurrences and pick the LAST one in the block
    const ddMmmMatches = Array.from(
      text.matchAll(/\b(\d{1,2})\s+(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\b/gi),
    );
    if (ddMmmMatches.length > 0) {
      const lastMatch = ddMmmMatches[ddMmmMatches.length - 1];
      const day = lastMatch[1].padStart(2, '0');
      const month = MONTH_MAP[lastMatch[2].toUpperCase()] || '01';
      return `${defaultYear}-${month}-${day}`;
    }

    const slashMonthMatches = Array.from(
      text.matchAll(/\b(\d{1,2})\/(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\b/gi),
    );
    if (slashMonthMatches.length > 0) {
      const lastMatch = slashMonthMatches[slashMonthMatches.length - 1];
      const day = lastMatch[1].padStart(2, '0');
      const month = MONTH_MAP[lastMatch[2].toUpperCase()] || '01';
      return `${defaultYear}-${month}-${day}`;
    }

    // 2. Check "DD/MM/YYYY" or "DD-MM-YYYY"
    const ddmmyyyy = /\b(\d{2})[\/\-](\d{2})[\/\-](\d{4})\b/.exec(text);
    if (ddmmyyyy) {
      return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
    }

    // 3. Check "YYYY-MM-DD"
    const yyyymmdd = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
    if (yyyymmdd) {
      return yyyymmdd[0];
    }

    return null;
  }

  private static cleanConceptText(text: string): string {
    return text
      .replace(/^\d{1,2}\s+(?:ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\s+/i, '')
      .replace(/^\d{1,2}\/(?:ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\s+/i, '')
      .replace(/\bCAJA\s+\d+\s+AUT\s+\d+\b/gi, '')
      .replace(/\bHORA\s+\d{2}:\d{2}\s+SUC\s+\d+\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static extractPayerDetails(concept: string): { payerName: string | null; payerRfc: string | null } {
    let payerName: string | null = null;
    let payerRfc: string | null = null;

    // Look for "POR ORDEN DE <NAME>"
    const ordenMatch = /POR ORDEN DE\s+([A-ZÑ\s.,]+?)(?:\s+CTA\.ORDENANTE|\s+REF\.|\s+SUC\.|\s+SU REF|$)/i.exec(concept);
    if (ordenMatch) {
      payerName = ordenMatch[1].trim();
    } else {
      // Look for "PAGO RECIBIDO DE <NAME>"
      const pagoMatch = /PAGO RECIBIDO DE\s+([A-ZÑ\s.,\/]+?)(?:\s+SU REF|\s+CTA\.|\s+REF\.|\s+POR ORDEN|$)/i.exec(concept);
      if (pagoMatch) {
        payerName = pagoMatch[1].replace(/[,/]/g, ' ').trim();
      }
    }

    // Look for RFC (12-13 chars)
    const rfcMatch = /\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/.exec(concept);
    if (rfcMatch) {
      payerRfc = rfcMatch[1].toUpperCase();
    }

    return { payerName, payerRfc };
  }
}
