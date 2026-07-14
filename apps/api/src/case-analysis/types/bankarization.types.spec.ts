// Tests estructurales para los tipos de bancarizacion (HU-10).
// TDD — Phase 1: estos tests validan que los enums (const arrays + tipos
// derivados) y el catalogo de conceptos existen y exponen los valores
// definidos en el spec/proposal. Las interfaces puras (PayrollMatchInput,
// PayrollMatchResult, MatchTrace, PagadoraEvaluation) son verficadas
// estructuralmente construyendo objetos que las satisfacen; su comportamiento
// real se prueba en los specs de los servicios (fases 2-4).
//
// Triangulacion omitida: definiciones de tipos puramente estructurales
// (no hay ramificacion ni logica en este modulo).

import {
  PAYROLL_RECONCILIATION_STATUSES,
  PAYROLL_MATCH_METHODS,
  CONCEPT_CATALOG_KEYWORDS,
  type PayrollReconciliationStatus,
  type PayrollMatchMethod,
  type PayrollMatchInput,
  type PayrollMatchResult,
  type MatchTrace,
  type PagadoraEvaluation,
  type PayrollReceipt,
  type PayrollDeposit,
} from './bankarization.types';

describe('bankarization.types', () => {
  describe('PayrollReconciliationStatus (8 valores del proposal)', () => {
    it('expone exactamente los 8 estados definidos', () => {
      expect(PAYROLL_RECONCILIATION_STATUSES).toEqual([
        'MATCHED',
        'NOT_MATCHED',
        'DISCREPANCY',
        'RFC_INCOMPATIBLE',
        'AMBIGUOUS',
        'PROVIDER_CANDIDATE',
        'PROVIDER_MIRROR_CONFIRMED',
        'MANUAL_REVIEW',
      ]);
    });

    it('acepta cada valor del catalogo como miembro valido del tipo', () => {
      const statusProbes: PayrollReconciliationStatus[] = [
        'MATCHED', 'NOT_MATCHED', 'DISCREPANCY', 'RFC_INCOMPATIBLE',
        'AMBIGUOUS', 'PROVIDER_CANDIDATE', 'PROVIDER_MIRROR_CONFIRMED',
        'MANUAL_REVIEW',
      ];
      expect(statusProbes).toHaveLength(8);
      expect(statusProbes[0]).toBe('MATCHED');
      expect(statusProbes[7]).toBe('MANUAL_REVIEW');
    });
  });

  describe('PayrollMatchMethod (4 valores)', () => {
    it('expone exactamente los 4 metodos', () => {
      expect(PAYROLL_MATCH_METHODS).toEqual([
        'RFC',
        'FALLBACK',
        'PROVIDER_MIRROR',
        'NONE',
      ]);
    });

    it('acepta cada valor del catalogo como miembro valido del tipo', () => {
      const methodProbes: PayrollMatchMethod[] = [
        'RFC', 'FALLBACK', 'PROVIDER_MIRROR', 'NONE',
      ];
      expect(methodProbes).toHaveLength(4);
      expect(methodProbes[3]).toBe('NONE');
    });
  });

  describe('catalogo de conceptos (deterministico)', () => {
    it('contiene las 6 keywords normalizadas unicas del spec', () => {
      // El spec lista 7 keywords crudos, pero "nómina" y "nomina" colapsan a
      // "nomina" tras normalizacion. El algoritmo opera sobre conceptos ya
      // normalizados, asi que el catalogo guarda las 6 entradas unicas.
      expect(CONCEPT_CATALOG_KEYWORDS).toContain('nomina');
      expect(CONCEPT_CATALOG_KEYWORDS).toContain('sueldo');
      expect(CONCEPT_CATALOG_KEYWORDS).toContain('pago de haberes');
      expect(CONCEPT_CATALOG_KEYWORDS).toContain('haberes');
      expect(CONCEPT_CATALOG_KEYWORDS).toContain('pago empleado');
      expect(CONCEPT_CATALOG_KEYWORDS).toContain('spei empleador');
      // sin duplicados
      expect(new Set(CONCEPT_CATALOG_KEYWORDS).size).toBe(
        CONCEPT_CATALOG_KEYWORDS.length,
      );
      expect(CONCEPT_CATALOG_KEYWORDS).toHaveLength(6);
    });
  });

  describe('interfaces estructurales (validacion de forma)', () => {
    it('PayrollReceipt permite construir un recibo con campos requeridos', () => {
      const receipt: PayrollReceipt = {
        index: 0,
        netIncome: 15000,
        paymentDate: '2026-07-01',
        employerRfc: 'ABC123456XYZ',
        employerName: 'Empresa Demo',
      };
      expect(receipt.index).toBe(0);
      expect(receipt.netIncome).toBe(15000);
      expect(receipt.employerRfc).toBe('ABC123456XYZ');
    });

    it('PayrollDeposit permite construir un deposito con campos requeridos', () => {
      const deposit: PayrollDeposit = {
        id: 'dep-1',
        date: '2026-07-02',
        amount: 14800,
        originalConcept: 'PAGO DE NOMINA',
        detectedPayerRfc: 'ABC123456XYZ',
        detectedPayerName: 'Empresa Demo',
      };
      expect(deposit.id).toBe('dep-1');
      expect(deposit.amount).toBe(14800);
      expect(deposit.originalConcept).toBe('PAGO DE NOMINA');
    });

    it('PayrollMatchInput agrupa receipts, deposits e isJointAccount', () => {
      const input: PayrollMatchInput = {
        receipts: [],
        deposits: [],
        isJointAccount: false,
      };
      expect(input.isJointAccount).toBe(false);
      expect(input.receipts).toEqual([]);
    });

    it('PayrollMatchResult expone status, method, candidato, score y trazabilidad', () => {
      const result: PayrollMatchResult = {
        receiptIndex: 0,
        status: 'MATCHED',
        method: 'RFC',
        candidateDepositId: 'dep-1',
        candidateAmount: 14800,
        candidateDate: '2026-07-02',
        candidateConcept: 'PAGO DE NOMINA',
        score: null,
        scotiabankExcluded: false,
        traceability: {
          rule: 'RFC_MATCH',
          rfcUsed: 'ABC123456XYZ',
          dateDiff: 1,
          amountDiffPercent: 1.33,
        },
      };
      expect(result.status).toBe('MATCHED');
      expect(result.method).toBe('RFC');
      expect(result.traceability.rule).toBe('RFC_MATCH');
      expect(result.scotiabankExcluded).toBe(false);
    });

    it('MatchTrace admite traceability NONE y campos opcionales ausentes', () => {
      const trace: MatchTrace = { rule: 'NONE' };
      expect(trace.rule).toBe('NONE');
    });

    it('PagadoraEvaluation expone banderas de deteccion y espejo', () => {
      const evalResult: PagadoraEvaluation = {
        receiptIndex: 0,
        isProviderCandidate: true,
        isMirrorConfirmed: false,
        providerRfc: 'PAGADORA456',
        employerDepositFound: false,
        providerDepositFound: true,
        scotiabankExcluded: true,
      };
      expect(evalResult.isProviderCandidate).toBe(true);
      expect(evalResult.scotiabankExcluded).toBe(true);
      expect(evalResult.providerRfc).toBe('PAGADORA456');
    });
  });
});