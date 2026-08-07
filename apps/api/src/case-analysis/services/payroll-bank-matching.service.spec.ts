// Tests unitarios para PayrollBankMatchingService (HU-10).
// Cobertura de los escenarios del spec payroll-bank-matching:
//  RFC match, DISCREPANCY, RFC_INCOMPATIBLE (sin fallback), fallback 3 reglas,
//  bidireccionalidad 1:1, score, cuenta mancomunada, catálogo de concepto.

import { PayrollBankMatchingService } from './payroll-bank-matching.service';

describe('PayrollBankMatchingService', () => {
  let service: PayrollBankMatchingService;

  beforeEach(() => {
    service = new PayrollBankMatchingService();
  });

  // ── Helpers de fabrica de datos ──────────────────────────────────────────
  const receipt = (
    over: Partial<{
      index: number;
      netIncome: number | null;
      paymentDate: string | null;
      employerRfc: string | null;
      employerName: string | null;
    }> = {},
  ) => {
    const paymentDate = over.paymentDate ?? '2026-07-01';
    return {
      index: over.index ?? 0,
      netIncome: over.netIncome ?? 10000,
      paymentDate,
      resolvedPaymentDate: {
        resolvedPaymentDate: paymentDate,
        source: 'MANUAL_OVERRIDE' as const,
        estimated: false,
        originalPeriodLabel: null,
      },
      employerRfc: over.employerRfc ?? null,
      employerName: over.employerName ?? null,
      originalName: null,
    };
  };

  const deposit = (
    over: Partial<{
      id: string;
      date: string | null;
      amount: number | null;
      originalConcept: string | null;
      detectedPayerRfc: string | null;
      detectedPayerName: string | null;
    }> = {},
  ) => ({
    id: over.id ?? 'dep-1',
    date: over.date ?? '2026-07-02',
    amount: over.amount ?? 10000,
    originalConcept:
      over.originalConcept ?? 'PAGO DE NOMINA MENSUAL',
    detectedPayerRfc: over.detectedPayerRfc ?? null,
    detectedPayerName: over.detectedPayerName ?? null,
  });

  // ── 2.2 RFC match con validacion triangular ───────────────────────────────
  describe('RFC match', () => {
    it('MATCHED cuando RFC coincide y fecha ±2d y monto ≤5%', () => {
      const results = service.match(
        [
          receipt({
            employerRfc: 'ABC123456XYZ',
            netIncome: 10000,
            paymentDate: '2026-07-01',
          }),
        ],
        [
          deposit({
            detectedPayerRfc: 'ABC123456XYZ',
            amount: 10000,
            date: '2026-07-02',
          }),
        ],
        false,
      );

      expect(results[0].status).toBe('MATCHED');
      expect(results[0].method).toBe('RFC');
      expect(results[0].candidateDepositId).toBe('dep-1');
      expect(results[0].score).toBeNull();
      expect(results[0].traceability.rule).toBe('RFC_MATCH');
      expect(results[0].traceability.rfcUsed).toBe('ABC123456XYZ');
    });

    it('normaliza RFC a mayusculas y trim antes de comparar', () => {
      const results = service.match(
        [
          receipt({
            employerRfc: '  abc123456xyz  ',
            netIncome: 10000,
            paymentDate: '2026-07-01',
          }),
        ],
        [
          deposit({
            detectedPayerRfc: 'ABC123456XYZ',
            amount: 10000,
            date: '2026-07-02',
          }),
        ],
        false,
      );

      expect(results[0].status).toBe('MATCHED');
      expect(results[0].method).toBe('RFC');
    });

    it('DISCREPANCY cuando RFC coincide + fecha OK pero monto >5%', () => {
      const results = service.match(
        [
          receipt({
            employerRfc: 'ABC123456XYZ',
            netIncome: 10000,
            paymentDate: '2026-07-01',
          }),
        ],
        [
          deposit({
            detectedPayerRfc: 'ABC123456XYZ',
            amount: 11000, // 10% diff
            date: '2026-07-02',
          }),
        ],
        false,
      );

      expect(results[0].status).toBe('DISCREPANCY');
      expect(results[0].method).toBe('RFC');
      // conservamos el candidato vinculado
      expect(results[0].candidateDepositId).toBe('dep-1');
      expect(results[0].candidateAmount).toBe(11000);
      expect(results[0].traceability.amountDiffPercent).toBeGreaterThan(5);
    });

    it('MATCHED en el limite exacto del 5% de diferencia de monto', () => {
      const results = service.match(
        [
          receipt({
            employerRfc: 'ABC123456XYZ',
            netIncome: 10000,
            paymentDate: '2026-07-01',
          }),
        ],
        [
          deposit({
            detectedPayerRfc: 'ABC123456XYZ',
            amount: 10500, // exacto 5%
            date: '2026-07-02',
          }),
        ],
        false,
      );

      expect(results[0].status).toBe('MATCHED');
      expect(results[0].method).toBe('RFC');
    });

    it('limite exacto ±2 dias en fecha acepta el match por RFC', () => {
      const results = service.match(
        [
          receipt({
            employerRfc: 'ABC123456XYZ',
            netIncome: 10000,
            paymentDate: '2026-07-01',
          }),
        ],
        [
          deposit({
            detectedPayerRfc: 'ABC123456XYZ',
            amount: 10000,
            date: '2026-07-03', // +2 dias
          }),
        ],
        false,
      );

      expect(results[0].status).toBe('MATCHED');
      expect(results[0].traceability.dateDiff).toBe(2);
    });

    it('RFC coincide pero fecha fuera de ±2d → NOT_MATCHED (no fallback)', () => {
      const results = service.match(
        [
          receipt({
            employerRfc: 'ABC123456XYZ',
            netIncome: 10000,
            paymentDate: '2026-07-01',
          }),
        ],
        [
          deposit({
            detectedPayerRfc: 'ABC123456XYZ',
            amount: 10000,
            date: '2026-07-10', // +9 dias, fuera del pre-filtro ±7d tambien
          }),
        ],
        false,
      );

      expect(results[0].status).toBe('NOT_MATCHED');
      expect(results[0].method).toBe('NONE');
    });
  });

  // ── 2.2 RFC incompatible (no fallback) ─────────────────────────────────────
  describe('RFC incompatible', () => {
    it('RFC_INCOMPATIBLE cuando ambos tienen RFC y difieren (sin fallback)', () => {
      const results = service.match(
        [
          receipt({
            employerRfc: 'ABC123456XYZ',
            netIncome: 10000,
            paymentDate: '2026-07-01',
          }),
        ],
        [
          deposit({
            detectedPayerRfc: 'DEF789012GHI',
            amount: 10000, // monto igual
            date: '2026-07-02', // fecha igual
            originalConcept: 'PAGO DE NOMINA', // concepto compatible
          }),
        ],
        false,
      );

      expect(results[0].status).toBe('RFC_INCOMPATIBLE');
      expect(results[0].method).toBe('NONE');
      expect(results[0].candidateDepositId).toBe('dep-1');
      expect(results[0].scotiabankExcluded).toBe(false);
    });
  });

  // ── 2.3 / 2.6 Fallback 3 reglas obligatorias + score + catálogo ────────────
  describe('Fallback sin RFC', () => {
    it('MATCHED con fallback cuando candidato unico pasa las 3 reglas', () => {
      const results = service.match(
        [
          receipt({
            employerRfc: null,
            netIncome: 15000,
            paymentDate: '2026-07-01',
          }),
        ],
        [
          deposit({
            detectedPayerRfc: null,
            amount: 14800, // 1.3% diff
            date: '2026-07-02', // +1 dia
            originalConcept: 'PAGO DE NOMINA MENSUAL',
          }),
        ],
        false,
      );

      expect(results[0].status).toBe('MATCHED');
      expect(results[0].method).toBe('FALLBACK');
      expect(results[0].traceability.rule).toBe('FALLBACK_3RULES');
      expect(results[0].candidateDepositId).toBe('dep-1');
      expect(results[0].score).not.toBeNull();
      expect(results[0].traceability.conceptKeyword).toBe('nomina');
    });

    it('MATCHED_2_OF_3 cuando cumple 2 de las 3 reglas (ej. falla monto pero fecha y concepto pasan)', () => {
      const results = service.match(
        [
          receipt({
            employerRfc: null,
            netIncome: 15000,
            paymentDate: '2026-07-01',
          }),
        ],
        [
          deposit({
            detectedPayerRfc: null,
            amount: 10000, // 33% diff, falla monto
            date: '2026-07-02', // pasa fecha
            originalConcept: 'PAGO DE NOMINA', // pasa concepto
          }),
        ],
        false,
      );

      expect(results[0].status).toBe('MATCHED_2_OF_3');
      expect(results[0].method).toBe('FALLBACK');
      expect(results[0].candidateDepositId).toBe('dep-1');
    });

    it('NOT_MATCHED cuando cumple menos de 2 reglas (falla monto y concepto)', () => {
      const results = service.match(
        [
          receipt({
            employerRfc: null,
            netIncome: 15000,
            paymentDate: '2026-07-01',
          }),
        ],
        [
          deposit({
            detectedPayerRfc: null,
            amount: 10000, // 33% diff, falla monto
            date: '2026-07-02', // pasa fecha (1/3 PASS)
            originalConcept: 'COMPRA TIENDA', // falla concepto
          }),
        ],
        false,
      );

      expect(results[0].status).toBe('NOT_MATCHED');
      expect(results[0].method).toBe('NONE');
      expect(results[0].candidateDepositId).toBe('dep-1');
    });

    it('matchea conceptos con acentos y espacios multiples (normalizacion)', () => {
      const results = service.match(
        [
          receipt({
            employerRfc: null,
            netIncome: 10000,
            paymentDate: '2026-07-01',
          }),
        ],
        [
          deposit({
            detectedPayerRfc: null,
            amount: 10000,
            date: '2026-07-02',
            originalConcept: '  Nómina   del   empleado  ',
          }),
        ],
        false,
      );

      expect(results[0].status).toBe('MATCHED');
      expect(results[0].method).toBe('FALLBACK');
      expect(results[0].traceability.conceptKeyword).toBe('nomina');
    });

    it('MATCHED_2_OF_3 cuando el concepto no matchea keyword pero fecha y monto sí pasan (2/3 PASS)', () => {
      const results = service.match(
        [
          receipt({
            employerRfc: null,
            netIncome: 10000,
            paymentDate: '2026-07-01',
          }),
        ],
        [
          deposit({
            detectedPayerRfc: null,
            amount: 10000,
            date: '2026-07-02',
            originalConcept: 'TRANSFERENCIA TERCEROS',
          }),
        ],
        false,
      );

      expect(results[0].status).toBe('MATCHED_2_OF_3');
      expect(results[0].method).toBe('FALLBACK');
    });

    it('selecciona el candidato de mayor score entre multiples validos', () => {
      const results = service.match(
        [
          receipt({
            employerRfc: null,
            netIncome: 10000,
            paymentDate: '2026-07-01',
          }),
        ],
        [
          deposit({
            id: 'dep-cerca',
            detectedPayerRfc: null,
            amount: 10000, // 0% diff — mejor monto
            date: '2026-07-01', // 0 dias
            originalConcept: 'NOMINA',
          }),
          deposit({
            id: 'dep-lejos',
            detectedPayerRfc: null,
            amount: 9800, // 2% diff
            date: '2026-07-02', // 1 dia
            originalConcept: 'SUELDO',
          }),
        ],
        false,
      );

      expect(results[0].status).toBe('MATCHED');
      expect(results[0].method).toBe('FALLBACK');
      expect(results[0].candidateDepositId).toBe('dep-cerca');
      expect(results[0].score).not.toBeNull();
      // el de mejor monto+fecha tiene score mayor
      expect(results[0].score).toBeGreaterThan(60);
    });

    it('AMBIGUOUS cuando multiples candidatos empatan en el score maximo', () => {
      const results = service.match(
        [
          receipt({
            employerRfc: null,
            netIncome: 10000,
            paymentDate: '2026-07-01',
          }),
        ],
        [
          deposit({
            id: 'dep-a',
            detectedPayerRfc: null,
            amount: 10000,
            date: '2026-07-01',
            originalConcept: 'NOMINA',
          }),
          deposit({
            id: 'dep-b',
            detectedPayerRfc: null,
            amount: 10000,
            date: '2026-07-01',
            originalConcept: 'SUELDO',
          }),
        ],
        false,
      );

      expect(results[0].status).toBe('AMBIGUOUS');
      expect(results[0].method).toBe('FALLBACK');
      // se enlaza el primer candidato fallado
      expect(results[0].candidateDepositId).toBe('dep-a');
    });
  });

  // ── 2.4 Bidireccionalidad 1:1 ──────────────────────────────────────────────
  describe('Bidireccionalidad 1:1', () => {
    it('primer recibo bloquea el deposito para el segundo', () => {
      const results = service.match(
        [
          receipt({
            index: 0,
            employerRfc: null,
            netIncome: 10000,
            paymentDate: '2026-07-01',
          }),
          receipt({
            index: 1,
            employerRfc: null,
            netIncome: 10000,
            paymentDate: '2026-07-01',
          }),
        ],
        [
          deposit({
            detectedPayerRfc: null,
            amount: 10000,
            date: '2026-07-01',
            originalConcept: 'NOMINA',
          }),
        ],
        false,
      );

      expect(results[0].status).toBe('MATCHED');
      expect(results[0].candidateDepositId).toBe('dep-1');
      expect(results[1].status).toBe('NOT_MATCHED');
      expect(results[1].candidateDepositId).toBeNull();
    });

    it('deposito liberado si el primer recibo no lo reclama', () => {
      const results = service.match(
        [
          receipt({
            index: 0,
            employerRfc: null,
            netIncome: 50000, // 80% diff, falla monto
            paymentDate: '2026-07-01',
          }),
          receipt({
            index: 1,
            employerRfc: null,
            netIncome: 10000,
            paymentDate: '2026-07-01',
          }),
        ],
        [
          deposit({
            detectedPayerRfc: null,
            amount: 10000,
            date: '2026-07-01',
            originalConcept: 'COMPRA TIENDA', // falla concepto (1/3 PASS -> NOT_MATCHED)
          }),
        ],
        false,
      );

      // R1 (50000 + COMPRA) no cumple al menos 2 reglas → no reclama el deposito
      expect(results[0].status).toBe('NOT_MATCHED');
      // R2 (10000 + COMPRA) cumple 2/3 reglas (fecha y monto pass) → reclama el deposito en MATCHED_2_OF_3
      expect(results[1].status).toBe('MATCHED_2_OF_3');
      expect(results[1].candidateDepositId).toBe('dep-1');
    });
  });

  // ── 2.5 Cuenta mancomunada ────────────────────────────────────────────────
  describe('Cuenta mancomunada', () => {
    it('fuerza MANUAL_REVIEW preservando el metodo RFC aplicado', () => {
      const results = service.match(
        [
          receipt({
            employerRfc: 'ABC123456XYZ',
            netIncome: 10000,
            paymentDate: '2026-07-01',
          }),
        ],
        [
          deposit({
            detectedPayerRfc: 'ABC123456XYZ',
            amount: 10000,
            date: '2026-07-02',
          }),
        ],
        true, // cuenta mancomunada
      );

      expect(results[0].status).toBe('MANUAL_REVIEW');
      expect(results[0].method).toBe('RFC');
      expect(results[0].candidateDepositId).toBe('dep-1');
    });

    it('fuerza MANUAL_REVIEW preservando el metodo FALLBACK', () => {
      const results = service.match(
        [
          receipt({
            employerRfc: null,
            netIncome: 10000,
            paymentDate: '2026-07-01',
          }),
        ],
        [
          deposit({
            detectedPayerRfc: null,
            amount: 10000,
            date: '2026-07-02',
            originalConcept: 'NOMINA',
          }),
        ],
        true,
      );

      expect(results[0].status).toBe('MANUAL_REVIEW');
      expect(results[0].method).toBe('FALLBACK');
    });
  });
});