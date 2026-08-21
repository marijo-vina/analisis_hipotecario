import { BankStatementGridExtractor } from './bank-statement-grid.extractor';
import { OcrLayout, OcrPage } from './document-ai.types';

describe('BankStatementGridExtractor', () => {
  it('returns empty array when layout is empty or invalid', () => {
    expect(BankStatementGridExtractor.extractTransactions({ pages: [] })).toEqual([]);
    expect(BankStatementGridExtractor.extractTransactions(null as any)).toEqual([]);
  });

  it('correctly identifies deposit column bounds and extracts only deposits (ignoring withdrawals and balances)', () => {
    const mockPage: OcrPage = {
      pageNumber: 2,
      width: 1600,
      height: 2400,
      lines: [
        // Column headers
        { text: 'DETALLE DE OPERACIONES', boundingBox: { top: 200, bottom: 230, left: 500, right: 1000 }, confidence: 0.99 },
        { text: 'FECHA', boundingBox: { top: 300, bottom: 320, left: 50, right: 120 }, confidence: 0.99 },
        { text: 'CONCEPTO', boundingBox: { top: 300, bottom: 320, left: 300, right: 500 }, confidence: 0.99 },
        { text: 'RETIROS', boundingBox: { top: 300, bottom: 320, left: 800, right: 900 }, confidence: 0.99 },
        { text: 'DEPOSITOS', boundingBox: { top: 300, bottom: 320, left: 1050, right: 1180 }, confidence: 0.99 },
        { text: 'SALDO', boundingBox: { top: 300, bottom: 320, left: 1300, right: 1400 }, confidence: 0.99 },

        // Row 1: Withdrawal (should NOT be extracted)
        { text: '04 FEB COMISION MANEJO CTA', boundingBox: { top: 400, bottom: 420, left: 50, right: 450 }, confidence: 0.95 },
        { text: '490.00', boundingBox: { top: 400, bottom: 420, left: 810, right: 890 }, confidence: 0.95 }, // Retiro
        { text: '604,070.16', boundingBox: { top: 400, bottom: 420, left: 1310, right: 1410 }, confidence: 0.95 }, // Saldo

        // Row 2: Deposit (SHOULD BE EXTRACTED)
        { text: '05 FEB DEPOSITO VENTAS NETAS D TAR POR EVOPAYMX', boundingBox: { top: 500, bottom: 520, left: 50, right: 600 }, confidence: 0.98 },
        { text: '6,200.00', boundingBox: { top: 500, bottom: 520, left: 1070, right: 1160 }, confidence: 0.99 }, // Deposito!
        { text: '610,270.16', boundingBox: { top: 500, bottom: 520, left: 1310, right: 1410 }, confidence: 0.95 },

        // Row 3: Another Deposit (SHOULD BE EXTRACTED)
        { text: '05 FEB PAGO RECIBIDO DE BBVA MEXICO POR ORDEN DE GESEME GRUPO CTA.ORDENANTE 012470001215022982 REF.0571706', boundingBox: { top: 600, bottom: 640, left: 50, right: 650 }, confidence: 0.98 },
        { text: '14,478.00', boundingBox: { top: 620, bottom: 640, left: 1060, right: 1170 }, confidence: 0.99 }, // Deposito!
      ],
      tokens: [],
    };

    const layout: OcrLayout = { pages: [mockPage] };
    const transactions = BankStatementGridExtractor.extractTransactions(layout, 2025);

    expect(transactions.length).toBe(2);
    expect(transactions[0].amount).toBe(6200);
    expect(transactions[0].date).toBe('2025-02-05');
    expect(transactions[0].originalConcept).toContain('DEPOSITO VENTAS NETAS');

    expect(transactions[1].amount).toBe(14478);
    expect(transactions[1].payerOrBeneficiaryName).toBe('GESEME GRUPO');
  });

  it('ignores pages without deposit headers (e.g. cover page)', () => {
    const coverPage: OcrPage = {
      pageNumber: 1,
      width: 1600,
      height: 2400,
      lines: [
        { text: 'ESTADO DE CUENTA BANCARIO', boundingBox: { top: 100, bottom: 130, left: 200, right: 800 }, confidence: 0.99 },
        { text: 'TITULAR: JUAN PEREZ', boundingBox: { top: 200, bottom: 220, left: 100, right: 400 }, confidence: 0.99 },
        { text: 'SALDO ANTERIOR: $100,000.00', boundingBox: { top: 300, bottom: 320, left: 100, right: 400 }, confidence: 0.99 },
      ],
      tokens: [],
    };

    const layout: OcrLayout = { pages: [coverPage] };
    const transactions = BankStatementGridExtractor.extractTransactions(layout, 2025);
    expect(transactions).toEqual([]);
  });
});
