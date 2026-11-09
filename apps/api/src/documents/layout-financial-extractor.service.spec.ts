// ===========================================================================
// LayoutFinancialExtractorService tests — lines-first rewrite
//
// PR 2: Tests for the service wrapper. Since the service is a thin
// delegation to extractFromLayout (tested in layout-lines-extractor.spec.ts),
// these tests focus on the service boundary: null/undefined input handling
// and the correct output contract.
// ===========================================================================

import { LayoutFinancialExtractorService } from './layout-financial-extractor.service';
import { OcrLayout, OcrPage, FinancialFieldsConfidence } from './document-ai.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLine(text: string, top = 0): any {
  return {
    text,
    boundingBox: { left: 0, top, right: 400, bottom: top + 14 },
    confidence: 0.95,
  };
}

function makePage(lines: any[]): OcrPage {
  return {
    pageNumber: 1,
    width: 1600,
    height: 2400,
    lines,
    tokens: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LayoutFinancialExtractorService (lines-first)', () => {
  const service = new LayoutFinancialExtractorService();

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('extract', () => {
    it('returns empty for null input', () => {
      const result = service.extract(null);
      expect(result.credits).toEqual([]);
      expect(result.warnings).toContain('No OCR pages found.');
    });

    it('returns empty for undefined input', () => {
      const result = service.extract(undefined);
      expect(result.credits).toEqual([]);
    });

    it('extracts SANTANDER paymentDueAmount=8775 from lines', () => {
      const lines = [
        makeLine('DETALLE DE CRÉDITOS', 0),
        makeLine('Saldo Actual Límite Crédito Monto a Pagar', 20),
        makeLine('Créditos Bancarios', 50),
        makeLine('SANTANDER 1234567890', 80),
        makeLine('0 53,763 42,400 MX MAY-25 NO APLICA', 100),
        makeLine('8,775 PAGO MÍNIMO PARA CUENTAS REVOLVENTES', 120),
      ];

      const layout: OcrLayout = { pages: [makePage(lines)] };
      const result = service.extract(layout);

      expect(result.credits.length).toBe(1);
      const santander = result.credits[0];
      expect(santander.institution).toContain('SANTANDER');
      expect(santander.fields.paymentDueAmount).toBe(8775);
      expect(result.confidence[0].paymentDueAmount).toBe(
        FinancialFieldsConfidence.HIGH,
      );
    });

    it('extracts TELCEL MER paymentDueAmount=0 (explicit zero → HIGH)', () => {
      const lines = [
        makeLine('DETALLE DE CRÉDITOS', 0),
        makeLine('SANTANDER 1234567890', 50),
        makeLine('0 53,763 MX NO APLICA', 70),
        makeLine('8,775 PAGO MÍNIMO', 90),
        makeLine('TELCEL MER 82953660', 130),
        makeLine('1,200 5,000 MX NO APLICA', 150),
        makeLine('0 MENSUAL', 170),
      ];

      const layout: OcrLayout = { pages: [makePage(lines)] };
      const result = service.extract(layout);

      expect(result.credits.length).toBe(2);
      const telcel = result.credits[1];
      expect(telcel.institution).toContain('TELCEL');
      expect(telcel.fields.paymentDueAmount).toBe(0);
      expect(result.confidence[1].paymentDueAmount).toBe(
        FinancialFieldsConfidence.HIGH,
      );
    });

    it('extracts AMEX paymentDueAmount=1875', () => {
      const lines = [
        makeLine('DETALLE DE CRÉDITOS', 0),
        makeLine('SANTANDER 1234567890', 50),
        makeLine('0 53,763 NO APLICA', 70),
        makeLine('8,775 PAGO MÍNIMO', 90),
        makeLine('AMEX 771051205274', 130),
        makeLine('30,283 193,336 150,000 MX NO APLICA', 150),
        makeLine('1,875 PAGO MÍNIMO PARA CUENTAS REVOLVENTES', 170),
      ];

      const layout: OcrLayout = { pages: [makePage(lines)] };
      const result = service.extract(layout);

      expect(result.credits.length).toBe(2);
      const amex = result.credits[1];
      expect(amex.institution).toContain('AMEX');
      expect(amex.fields.paymentDueAmount).toBe(1875);
      expect(result.confidence[1].paymentDueAmount).toBe(
        FinancialFieldsConfidence.HIGH,
      );
    });

    it('nulls paymentDueAmount with LOW confidence when no payment line', () => {
      const lines = [
        makeLine('DETALLE DE CRÉDITOS', 0),
        makeLine('VW LEASING 52440506', 50),
        makeLine('0 894,985 MX NO APLICA', 70),
        // No payment line → closed credit → null + LOW
      ];

      const layout: OcrLayout = { pages: [makePage(lines)] };
      const result = service.extract(layout);

      expect(result.credits.length).toBe(1);
      expect(result.credits[0].fields.paymentDueAmount).toBeNull();
      expect(result.confidence[0].paymentDueAmount).toBe(
        FinancialFieldsConfidence.LOW,
      );
    });

    it('tracks subsection Bancarios / No Bancarios', () => {
      const lines = [
        makeLine('DETALLE DE CRÉDITOS', 0),
        makeLine('Créditos Bancarios', 50),
        makeLine('BBVA 9876543210', 80),
        makeLine('0 50,000 MX NO APLICA', 100),
        makeLine('Créditos No Bancarios', 140),
        makeLine('TELCEL MER 82953660', 170),
        makeLine('1,200 MX NO APLICA', 190),
      ];

      const layout: OcrLayout = { pages: [makePage(lines)] };
      const result = service.extract(layout);

      expect(result.credits.length).toBe(2);
      expect(result.credits[0].subsection).toBe('BANCARIOS');
      expect(result.credits[1].subsection).toBe('NO_BANCARIOS');
    });
  });
});
