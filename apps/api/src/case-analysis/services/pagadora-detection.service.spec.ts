// Tests unitarios para PagadoraDetectionService (HU-10).
// Cubre los 5 escenarios del spec pagadora-detection:
//   provider candidate, sin recurrencia, doble espejo confirmado,
//   solo pagadora sin espejo, regla Scotiabank (excluido / no excluido / no aplica).

import { PagadoraDetectionService } from './pagadora-detection.service';
import type {
  PayrollMatchResult,
  PayrollReceipt,
  PayrollDeposit,
} from '../types/bankarization.types';

describe('PagadoraDetectionService', () => {
  let service: PagadoraDetectionService;

  beforeEach(() => {
    service = new PagadoraDetectionService();
  });

  const receipt = (over: Partial<PayrollReceipt> = {}): PayrollReceipt => ({
    index: over.index ?? 0,
    netIncome: over.netIncome ?? 10000,
    paymentDate: over.paymentDate ?? '2026-07-01',
    employerRfc: over.employerRfc ?? 'EMPRESA123',
    employerName: over.employerName ?? 'Empresa Demo',
  });

  const deposit = (over: Partial<PayrollDeposit> = {}): PayrollDeposit => ({
    id: over.id ?? 'dep-1',
    date: over.date ?? '2026-07-02',
    amount: over.amount ?? 10000,
    originalConcept: over.originalConcept ?? 'PAGO DE NOMINA',
    detectedPayerRfc: over.detectedPayerRfc ?? null,
    detectedPayerName: over.detectedPayerName ?? null,
  });

  const rfcIncompatibleResult = (
    over: Partial<PayrollMatchResult> = {},
  ): PayrollMatchResult => ({
    receiptIndex: over.receiptIndex ?? 0,
    status: 'RFC_INCOMPATIBLE',
    method: 'NONE',
    candidateDepositId: over.candidateDepositId ?? 'dep-1',
    candidateAmount: over.candidateAmount ?? 10000,
    candidateDate: over.candidateDate ?? '2026-07-02',
    candidateConcept: over.candidateConcept ?? 'PAGO DE NOMINA',
    score: null,
    scotiabankExcluded: false,
    traceability: over.traceability ?? { rule: 'NONE' },
  });

  describe('Provider candidate (3.2)', () => {
    it('detecta PROVIDER_CANDIDATE cuando hay ≥2 depositos recurrentes del RFC distinto', () => {
      const r = receipt({ employerRfc: 'EMPRESA123' });
      const deposits: PayrollDeposit[] = [
        deposit({
          id: 'd-p1',
          detectedPayerRfc: 'PAGADORA456',
          amount: 10000,
          date: '2026-07-02',
          originalConcept: 'PAGO DE NOMINA',
        }),
        deposit({
          id: 'd-p2',
          detectedPayerRfc: 'PAGADORA456',
          amount: 10000,
          date: '2026-07-16',
          originalConcept: 'PAGO DE NOMINA',
        }),
      ];
      const results: PayrollMatchResult[] = [
        rfcIncompatibleResult(),
      ];

      const evals = service.evaluate(results, [r], deposits);

      expect(evals[0].receiptIndex).toBe(0);
      expect(evals[0].isProviderCandidate).toBe(true);
      expect(evals[0].providerRfc).toBe('PAGADORA456');
      // concepto con NOMINA → no excluido
      expect(evals[0].scotiabankExcluded).toBe(false);
    });

    it('sin patron recurrente (1 solo deposito aislado) → no es provider candidate', () => {
      const r = receipt({ employerRfc: 'EMPRESA123' });
      const deposits: PayrollDeposit[] = [
        deposit({
          id: 'd-p1',
          detectedPayerRfc: 'PAGADORA456',
          date: '2026-07-02',
        }),
      ];
      const results: PayrollMatchResult[] = [
        rfcIncompatibleResult(),
      ];

      const evals = service.evaluate(results, [r], deposits);

      expect(evals[0].isProviderCandidate).toBe(false);
      expect(evals[0].providerRfc).toBeNull();
    });
  });

  describe('Doble espejo (3.3)', () => {
    it('confirma PROVIDER_MIRROR cuando hay deposito compatible del empleador Y de la pagadora', () => {
      const r = receipt({ employerRfc: 'EMPRESA123' });
      const deposits: PayrollDeposit[] = [
        deposit({
          id: 'd-p1',
          detectedPayerRfc: 'PAGADORA456',
          amount: 10000,
          date: '2026-07-02',
          originalConcept: 'PAGO DE NOMINA',
        }),
        deposit({
          id: 'd-p2',
          detectedPayerRfc: 'PAGADORA456',
          amount: 10000,
          date: '2026-07-16',
          originalConcept: 'PAGO DE NOMINA',
        }),
        deposit({
          id: 'd-emp',
          detectedPayerRfc: 'EMPRESA123',
          amount: 10000,
          date: '2026-07-02', // mismo monto y fecha compatibles
          originalConcept: 'NOMINA',
        }),
      ];
      const results: PayrollMatchResult[] = [
        rfcIncompatibleResult({ candidateDepositId: 'd-p1' }),
      ];

      const evals = service.evaluate(results, [r], deposits);

      expect(evals[0].isProviderCandidate).toBe(true);
      expect(evals[0].isMirrorConfirmed).toBe(true);
      expect(evals[0].employerDepositFound).toBe(true);
      expect(evals[0].providerDepositFound).toBe(true);
    });

    it('solo pagadora sin espejo del empleador → no confirma mirror', () => {
      const r = receipt({ employerRfc: 'EMPRESA123' });
      const deposits: PayrollDeposit[] = [
        deposit({
          id: 'd-p1',
          detectedPayerRfc: 'PAGADORA456',
          amount: 10000,
          date: '2026-07-02',
        }),
        deposit({
          id: 'd-p2',
          detectedPayerRfc: 'PAGADORA456',
          amount: 10000,
          date: '2026-07-16',
        }),
        // No hay deposito del empleador EMPRESA123 en el mismo periodo.
      ];
      const results: PayrollMatchResult[] = [
        rfcIncompatibleResult({ candidateDepositId: 'd-p1' }),
      ];

      const evals = service.evaluate(results, [r], deposits);

      expect(evals[0].isProviderCandidate).toBe(true);
      expect(evals[0].isMirrorConfirmed).toBe(false);
      expect(evals[0].employerDepositFound).toBe(false);
    });
  });

  describe('Regla Scotiabank (3.4)', () => {
    it('excluye cuando concepto sin "NOMINA" + RFC diferente al empleador', () => {
      const r = receipt({ employerRfc: 'EMPRESA123' });
      const deposits: PayrollDeposit[] = [
        deposit({
          id: 'd-p1',
          detectedPayerRfc: 'PAGADORA456',
          date: '2026-07-02',
          originalConcept: 'TRANSFERENCIA TERCEROS', // sin NOMINA
        }),
        deposit({
          id: 'd-p2',
          detectedPayerRfc: 'PAGADORA456',
          date: '2026-07-16',
          originalConcept: 'TRANSFERENCIA TERCEROS',
        }),
      ];
      const results: PayrollMatchResult[] = [
        rfcIncompatibleResult({
          candidateConcept: 'TRANSFERENCIA TERCEROS',
        }),
      ];

      const evals = service.evaluate(results, [r], deposits);

      expect(evals[0].isProviderCandidate).toBe(true);
      expect(evals[0].scotiabankExcluded).toBe(true);
    });

    it('no excluye cuando concepto contiene "NOMINA"', () => {
      const r = receipt({ employerRfc: 'EMPRESA123' });
      const deposits: PayrollDeposit[] = [
        deposit({
          id: 'd-p1',
          detectedPayerRfc: 'PAGADORA456',
          date: '2026-07-02',
          originalConcept: 'PAGO DE NOMINA',
        }),
        deposit({
          id: 'd-p2',
          detectedPayerRfc: 'PAGADORA456',
          date: '2026-07-16',
          originalConcept: 'Pago de nómina quincenal',
        }),
      ];
      const results: PayrollMatchResult[] = [
        rfcIncompatibleResult({ candidateConcept: 'PAGO DE NOMINA' }),
      ];

      const evals = service.evaluate(results, [r], deposits);

      expect(evals[0].scotiabankExcluded).toBe(false);
    });

    it('no aplica cuando el deposito es directo del empleador (mismo RFC)', () => {
      const r = receipt({ employerRfc: 'EMPRESA123' });
      const deposits: PayrollDeposit[] = [
        deposit({
          id: 'd-emp1',
          detectedPayerRfc: 'EMPRESA123',
          date: '2026-07-02',
          originalConcept: 'TRANSFERENCIA',
        }),
        deposit({
          id: 'd-emp2',
          detectedPayerRfc: 'EMPRESA123',
          date: '2026-07-16',
          originalConcept: 'TRANSFERENCIA',
        }),
      ];
      // Resultado NO es RFC_INCOMPATIBLE (mismo RFC) → scotiabank no aplica.
      const results: PayrollMatchResult[] = [
        {
          ...rfcIncompatibleResult(),
          status: 'MATCHED',
          method: 'RFC',
        },
      ];

      const evals = service.evaluate(results, [r], deposits);

      // Mismo RFC → no es provider candidate → scotiabankExcluded false.
      expect(evals[0].isProviderCandidate).toBe(false);
      expect(evals[0].scotiabankExcluded).toBe(false);
    });

    it('normalizacion cubre acentos y case: "Nómina Especial" → no excluido', () => {
      const r = receipt({ employerRfc: 'EMPRESA123' });
      const deposits: PayrollDeposit[] = [
        deposit({
          id: 'd-p1',
          detectedPayerRfc: 'PAGADORA456',
          date: '2026-07-02',
          originalConcept: '  Nómina   Especial  ',
        }),
        deposit({
          id: 'd-p2',
          detectedPayerRfc: 'PAGADORA456',
          date: '2026-07-16',
          originalConcept: 'NOMINA',
        }),
      ];
      const results: PayrollMatchResult[] = [
        rfcIncompatibleResult({
          candidateConcept: '  Nómina   Especial  ',
        }),
      ];

      const evals = service.evaluate(results, [r], deposits);

      expect(evals[0].scotiabankExcluded).toBe(false);
    });
  });

  describe('Compatibilidad de monto/fecha para espejo', () => {
    it('requiere monto ±5% y fecha ±2d para confirmar el espejo del empleador', () => {
      const r = receipt({
        employerRfc: 'EMPRESA123',
        netIncome: 10000,
        paymentDate: '2026-07-01',
      });
      const deposits: PayrollDeposit[] = [
        deposit({
          id: 'd-p1',
          detectedPayerRfc: 'PAGADORA456',
          amount: 10000,
          date: '2026-07-02',
        }),
        deposit({
          id: 'd-p2',
          detectedPayerRfc: 'PAGADORA456',
          amount: 10000,
          date: '2026-07-16',
        }),
        // deposito del empleador, pero monto muy distinto (50% diff) → no espejo
        deposit({
          id: 'd-emp',
          detectedPayerRfc: 'EMPRESA123',
          amount: 5000,
          date: '2026-07-02',
        }),
      ];
      const results: PayrollMatchResult[] = [
        rfcIncompatibleResult({ candidateDepositId: 'd-p1' }),
      ];

      const evals = service.evaluate(results, [r], deposits);

      expect(evals[0].isProviderCandidate).toBe(true);
      expect(evals[0].isMirrorConfirmed).toBe(false);
      expect(evals[0].employerDepositFound).toBe(false);
    });
  });
});