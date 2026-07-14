// ---------------------------------------------------------------------------
// PagadoraDetectionService (HU-10)
//
// Identifica esquemas de pagadora (terceros que pagan la nomina) para recibos
// marcados como RFC_INCOMPATIBLE por el matching. Aplica:
//   - deteccion de provider candidate (RFC recurrente distinto al empleador),
//   - doble espejo (deposito compatible del empleador + de la pagadora),
//   - regla limitativa Scotiabank: concepto sin "NOMINA" → scotiabankExcluded.
//
// Es puro: produce PagadoraEvaluation[]; la regla aplica los resultados a los
// PayrollMatchResult sin mutar entradas aqui.
// ---------------------------------------------------------------------------

import { Injectable } from '@nestjs/common';
import { normalizeText } from '../normalize';
import type {
  PagadoraEvaluation,
  PayrollDeposit,
  PayrollMatchResult,
  PayrollReceipt,
} from '../types/bankarization.types';
import {
  amountDiffPercent,
  dateDiffDays,
  normalizeRfc,
} from './payroll-bank-matching.service';

/** Minimo de depositos recurrentes del RFC distinto para ser pagadora. */
const MIN_RECURRENCE = 2;
const DATE_TOLERANCE_DAYS = 2;
const AMOUNT_TOLERANCE_PCT = 5;

/**
 * Normaliza un concepto a MAYUSCULAS sin acentos para la regla Scotiabank
 * (la regla busca la palabra "NOMINA" en mayusculas).
 */
function normalizeConceptUpper(concept: string | null): string {
  if (concept == null) return '';
  return normalizeText(concept).toUpperCase();
}

/** true cuando el concepto normalizado contiene la palabra "NOMINA". */
function containsNomina(concept: string | null): boolean {
  return normalizeConceptUpper(concept).includes('NOMINA');
}

@Injectable()
export class PagadoraDetectionService {
  /**
   * Evalua esquemas de pagadora para los resultados RFC_INCOMPATIBLE.
   *
   * Devuelve una evaluacion por recibo (una por cada resultado de entrada,
   * aunque solo los RFC_INCOMPATIBLE producen deteccion positiva).
   *
   * @param results resultados del matching (pueden ser de cualquier estado).
   * @param receipts recibos originales (mismo indice que results).
   * @param deposits depositos bancarios disponibles.
   */
  evaluate(
    results: PayrollMatchResult[],
    receipts: PayrollReceipt[],
    deposits: PayrollDeposit[],
  ): PagadoraEvaluation[] {
    return results.map((result, i) => {
      const receipt = receipts[i] ?? receipts[result.receiptIndex];

      // Solo los RFC_INCOMPATIBLE son candidatos a pagadora.
      if (result.status !== 'RFC_INCOMPATIBLE' || !receipt) {
        return this.noEvaluation(result.receiptIndex);
      }

      const employerRfc = normalizeRfc(receipt.employerRfc);

      // RFCs distintos presentes en los depositos (distintos al empleador).
      const distinctRfcs = new Set<string>();
      for (const d of deposits) {
        const rfc = normalizeRfc(d.detectedPayerRfc);
        if (rfc != null && rfc !== employerRfc) {
          distinctRfcs.add(rfc);
        }
      }

      // Si no hay RFC distinto, no es pagadora.
      if (distinctRfcs.size === 0) {
        return this.noEvaluation(result.receiptIndex);
      }

      // Elegir el RFC distinto mas recurrente como provider candidate.
      let providerRfc: string | null = null;
      let maxCount = 0;
      for (const rfc of distinctRfcs) {
        const count = deposits.filter(
          (d) => normalizeRfc(d.detectedPayerRfc) === rfc,
        ).length;
        if (count > maxCount) {
          maxCount = count;
          providerRfc = rfc;
        }
      }

      const isProviderCandidate = maxCount >= MIN_RECURRENCE;
      if (!isProviderCandidate) {
        return this.noEvaluation(result.receiptIndex);
      }

      // Doble espejo: deposito compatible del empleador + de la pagadora.
      const employerDepositFound = deposits.some(
        (d) =>
          normalizeRfc(d.detectedPayerRfc) === employerRfc &&
          this.isCompatible(receipt, d),
      );
      const providerDeposits = deposits.filter(
        (d) => normalizeRfc(d.detectedPayerRfc) === providerRfc,
      );
      const providerDepositFound = providerDeposits.some((d) =>
        this.isCompatible(receipt, d),
      );
      const isMirrorConfirmed =
        employerDepositFound && providerDepositFound;

      // Regla Scotiabank: concepto de la pagadora sin "NOMINA" → excluido.
      const scotiabankExcluded = providerDeposits.some(
        (d) => !containsNomina(d.originalConcept),
      );

      return {
        receiptIndex: result.receiptIndex,
        isProviderCandidate: true,
        isMirrorConfirmed,
        providerRfc,
        employerDepositFound,
        providerDepositFound,
        scotiabankExcluded,
      };
    });
  }

  /** Compatibilidad monto ±5% + fecha ±2d entre recibo y deposito. */
  private isCompatible(
    receipt: PayrollReceipt,
    deposit: PayrollDeposit,
  ): boolean {
    const dd = dateDiffDays(receipt.paymentDate, deposit.date);
    const ad = amountDiffPercent(receipt.netIncome, deposit.amount);
    return (
      dd != null &&
      dd <= DATE_TOLERANCE_DAYS &&
      ad != null &&
      ad <= AMOUNT_TOLERANCE_PCT
    );
  }

  private noEvaluation(receiptIndex: number): PagadoraEvaluation {
    return {
      receiptIndex,
      isProviderCandidate: false,
      isMirrorConfirmed: false,
      providerRfc: null,
      employerDepositFound: false,
      providerDepositFound: false,
      scotiabankExcluded: false,
    };
  }
}