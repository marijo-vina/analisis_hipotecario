import { OcrLayout, OcrPage, OcrLine } from './document-ai.types';
import { RawTransaction } from './bank-statement-cleaner.service';

export interface GridExtractionOptions {
  depositHeaderPatterns?: RegExp[];
  withdrawalHeaderPatterns?: RegExp[];
  balanceHeaderPatterns?: RegExp[];
  dateHeaderPatterns?: RegExp[];
  conceptHeaderPatterns?: RegExp[];
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
    if (!layout || !Array.isArray(layout.pages) || layout.pages.length === 0) {
      return [];
    }

    const yearStr = statementYear ? String(statementYear) : new Date().getFullYear().toString();
    const transactions: RawTransaction[] = [];

    for (let pIdx = 0; pIdx < layout.pages.length; pIdx++) {
      const page = layout.pages[pIdx];
      const pageTransactions = this.extractPageTransactions(page, yearStr, options);
      transactions.push(...pageTransactions);
    }

    return transactions;
  }

  private static extractPageTransactions(
    page: OcrPage,
    yearStr: string,
    options: GridExtractionOptions,
  ): RawTransaction[] {
    const lines = page.lines || [];
    if (lines.length === 0) return [];

    // 1. Locate column headers
    let depositHeader: OcrLine['boundingBox'] | null = null;
    let withdrawalHeader: OcrLine['boundingBox'] | null = null;
    let balanceHeader: OcrLine['boundingBox'] | null = null;

    const depositPatterns = options.depositHeaderPatterns || DEFAULT_OPTIONS.depositHeaderPatterns!;
    const withdrawalPatterns = options.withdrawalHeaderPatterns || DEFAULT_OPTIONS.withdrawalHeaderPatterns!;
    const balancePatterns = options.balanceHeaderPatterns || DEFAULT_OPTIONS.balanceHeaderPatterns!;

    for (const line of lines) {
      const text = line.text.trim().toUpperCase();
      const box = line.boundingBox;
      // Headers typically reside in the upper 45% of the page
      if (box.top > page.height * 0.45) continue;

      if (depositPatterns.some((p) => p.test(text))) {
        depositHeader = box;
      } else if (withdrawalPatterns.some((p) => p.test(text))) {
        withdrawalHeader = box;
      } else if (balancePatterns.some((p) => p.test(text))) {
        balanceHeader = box;
      }
    }

    if (!depositHeader) {
      // Non-transaction page (e.g. cover page, legal terms, etc.)
      return [];
    }

    // 2. Compute dynamic X-boundaries for deposit column
    const depLeft = withdrawalHeader
      ? (withdrawalHeader.right + depositHeader.left) / 2
      : depositHeader.left - 40;
    const depRight = balanceHeader
      ? (depositHeader.right + balanceHeader.left) / 2
      : depositHeader.right + 60;

    const tableTop = depositHeader.bottom + 5;

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
      if (centerX >= depLeft && centerX <= depRight) {
        const text = line.text.trim();
        // Match valid currency formats: e.g. "6,200.00", "$14,478.00", "4200.00"
        if (/^\$?[\d,]+\.\d{2}$/.test(text)) {
          const amt = this.parseAmount(text);
          if (amt !== null && amt > 0) {
            depositCells.push({
              amount: amt,
              top: box.top,
              bottom: box.bottom,
            });
          }
        }
      }
    }

    // Sort deposits top-to-bottom
    depositCells.sort((a, b) => a.top - b.top);

    // 4. Associate concept block and date for each deposit
    //    Strategy: for each deposit amount, scan BACKWARD through left-column
    //    lines to find the nearest date line (DD MMM pattern). This eliminates
    //    withdrawal concepts that sit between consecutive deposits.
    const dateLinePattern = /^\d{1,2}\s+(?:ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\b/i;

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
        const isLeftOfAmounts = b.right < (withdrawalHeader ? withdrawalHeader.left : depLeft);
        return isLeftOfAmounts && b.top >= safeFloor && b.bottom <= blockBottom && b.top > tableTop;
      });
      candidateLines.sort((a, b) => a.boundingBox.top - b.boundingBox.top);

      // Find the deposit's own date line by scanning BACKWARD from the amount
      // position. The first date line found going upward is the start of this
      // deposit's concept block; everything above belongs to withdrawals.
      let dateLineIndex = -1;
      for (let j = candidateLines.length - 1; j >= 0; j--) {
        if (dateLinePattern.test(candidateLines[j].text.trim())) {
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

    return pageTransactions;
  }

  private static parseAmount(text: string): number | null {
    const clean = text.replace(/[$,\s]/g, '');
    const val = parseFloat(clean);
    return isNaN(val) ? null : val;
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
