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

  it('reuses previous column bounds when a transaction table continues on a page without headers', () => {
    const headerPage: OcrPage = {
      pageNumber: 2,
      width: 1600,
      height: 2400,
      lines: [
        { text: 'FECHA', boundingBox: { top: 300, bottom: 320, left: 50, right: 120 }, confidence: 0.99 },
        { text: 'CONCEPTO', boundingBox: { top: 300, bottom: 320, left: 300, right: 500 }, confidence: 0.99 },
        { text: 'RETIROS', boundingBox: { top: 300, bottom: 320, left: 800, right: 900 }, confidence: 0.99 },
        { text: 'DEPOSITOS', boundingBox: { top: 300, bottom: 320, left: 1050, right: 1180 }, confidence: 0.99 },
        { text: 'SALDO', boundingBox: { top: 300, bottom: 320, left: 1300, right: 1400 }, confidence: 0.99 },
        { text: '05 FEB DEPOSITO EN PAGINA CON HEADER', boundingBox: { top: 500, bottom: 520, left: 50, right: 600 }, confidence: 0.98 },
        { text: '6,200.00', boundingBox: { top: 500, bottom: 520, left: 1070, right: 1160 }, confidence: 0.99 },
      ],
      tokens: [],
    };

    const continuationPage: OcrPage = {
      pageNumber: 3,
      width: 1600,
      height: 2400,
      lines: [
        { text: '06 FEB DEPOSITO EN PAGINA SIN HEADER', boundingBox: { top: 150, bottom: 170, left: 50, right: 600 }, confidence: 0.98 },
        { text: '8,500.00', boundingBox: { top: 150, bottom: 170, left: 1070, right: 1160 }, confidence: 0.99 },
        { text: '620,000.00', boundingBox: { top: 150, bottom: 170, left: 1310, right: 1410 }, confidence: 0.95 },
      ],
      tokens: [],
    };

    const output = BankStatementGridExtractor.extractWithDiagnostics(
      { pages: [headerPage, continuationPage] },
      2025,
    );

    expect(output.transactions).toHaveLength(2);
    expect(output.transactions[1]).toEqual(
      expect.objectContaining({
        date: '2025-02-06',
        amount: 8500,
        originalConcept: expect.stringContaining('PAGINA SIN HEADER'),
      }),
    );
    expect(output.diagnostics.pages[1]).toEqual(
      expect.objectContaining({
        depositHeaderFound: false,
        depositHeaderInherited: true,
        transactionCount: 1,
      }),
    );
  });

  it('extracts BBVA-style continuation deposits from combined headers and multi-amount OCR lines', () => {
    const headerPage: OcrPage = {
      pageNumber: 2,
      width: 1800,
      height: 2200,
      lines: [
        { text: 'FECHA', boundingBox: { top: 1492, bottom: 1515, left: 114, right: 192 }, confidence: 0.99 },
        { text: 'SALDO', boundingBox: { top: 1493, bottom: 1515, left: 1487, right: 1574 }, confidence: 0.99 },
        { text: 'REFERENCIA CARGOS ABONOS OPERACION', boundingBox: { top: 1520, bottom: 1542, left: 924, right: 1472 }, confidence: 0.99 },
      ],
      tokens: [],
    };

    const continuationPage: OcrPage = {
      pageNumber: 3,
      width: 1800,
      height: 2200,
      lines: [
        { text: '26/JUL 26/JUL', boundingBox: { top: 1031, bottom: 1052, left: 49, right: 266 }, confidence: 0.98 },
        { text: 'PAGO DE NOMINA', boundingBox: { top: 1032, bottom: 1053, left: 309, right: 547 }, confidence: 0.98 },
        { text: '46,577.00 296,172.74', boundingBox: { top: 1032, bottom: 1053, left: 1202, right: 1471 }, confidence: 0.99 },
        { text: '293,640.24', boundingBox: { top: 1033, bottom: 1054, left: 1580, right: 1708 }, confidence: 0.99 },
        { text: 'INSTITUTO MEXICANO DEL SEGURO SOCIAL', boundingBox: { top: 1066, bottom: 1088, left: 307, right: 837 }, confidence: 0.98 },
      ],
      tokens: [],
    };

    const output = BankStatementGridExtractor.extractWithDiagnostics(
      { pages: [headerPage, continuationPage] },
      2025,
    );

    expect(output.transactions).toHaveLength(1);
    expect(output.transactions[0]).toEqual(
      expect.objectContaining({
        date: '2025-07-26',
        amount: 46577,
        originalConcept: expect.stringContaining('PAGO DE NOMINA'),
      }),
    );
    expect(output.diagnostics.pages[0].depositHeaderText).toBe(
      'REFERENCIA CARGOS ABONOS OPERACION',
    );
    expect(output.diagnostics.pages[1].depositHeaderInherited).toBe(true);
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

  it('reads a Banorte deposit whose description wraps below the amount', () => {
    const page: OcrPage = {
      pageNumber: 2,
      width: 1700,
      height: 2200,
      lines: [
        {
          text: 'MONTO DEL DEPOSITO MONTO DEL RETIRO',
          boundingBox: { top: 200, bottom: 220, left: 1000, right: 1400 },
          confidence: 0.99,
        },
        {
          text: '01-JUN-26 FN779 SPEI RECIBIDO DEL CLIENTE',
          boundingBox: { top: 300, bottom: 320, left: 100, right: 900 },
          confidence: 0.98,
        },
        {
          text: '190,000.00',
          boundingBox: { top: 300, bottom: 320, left: 1080, right: 1180 },
          confidence: 0.99,
        },
        {
          text: '200,755.95',
          boundingBox: { top: 300, bottom: 320, left: 1500, right: 1600 },
          confidence: 0.99,
        },
        {
          text: 'ACAMEX DE LA CLABE 699 CON RFC',
          boundingBox: { top: 340, bottom: 360, left: 150, right: 900 },
          confidence: 0.98,
        },
        {
          text: 'ACM230101AA1 CONCEPTO: PAGO REFERENCIA: 1777159',
          boundingBox: { top: 370, bottom: 390, left: 150, right: 900 },
          confidence: 0.98,
        },
        {
          text: '01-JUN-26 COMPRA ORDEN DE PAGO SPEI',
          boundingBox: { top: 480, bottom: 500, left: 100, right: 900 },
          confidence: 0.98,
        },
        {
          text: '66,488.00',
          boundingBox: { top: 480, bottom: 500, left: 1280, right: 1380 },
          confidence: 0.99,
        },
      ],
      tokens: [],
    };

    const transactions = BankStatementGridExtractor.extractTransactions(
      { pages: [page] },
      2026,
    );

    expect(transactions).toHaveLength(1);
    expect(transactions[0].amount).toBe(190000);
    expect(transactions[0].date).toBe('2026-06-01');
    expect(transactions[0].originalConcept).toContain('ACAMEX');
    expect(transactions[0].originalConcept).toContain('ACM230101AA1');
    expect(transactions[0].payerRfc).toBe('ACM230101AA1');
  });
});
