import { Injectable, Logger } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Economic Sectors detected from SAT Economic Activities
// ---------------------------------------------------------------------------
export type EconomicSector =
  | 'HEALTH_MEDICAL'
  | 'PROFESSIONAL_SERVICES'
  | 'FOOD_RESTAURANT'
  | 'RENTAL'
  | 'CONSTRUCTION_TRADE'
  | 'GENERAL_COMMERCE';

export type TrashCategory =
  | 'OWN_TRANSFER'
  | 'LOAN_OR_CREDIT'
  | 'INVESTMENT_WITHDRAWAL'
  | 'REFUND_OR_REVERSAL'
  | 'INFORMAL_FAMILY'
  | 'DOWN_PAYMENT_SAVING'
  | 'RENT_WITHOUT_CSF_REGIME'
  | 'OTHER_NON_BUSINESS';

export type ValidCategory =
  | 'TPV_LIQUIDATION'
  | 'COMMERCIAL_SPEI'
  | 'RECURRENT_CASH'
  | 'RENTAL_WITH_REGIME'
  | 'SECTOR_SPECIFIC_INCOME'
  | 'GENERAL_INCOME';

export type TransactionClassification = 'VALID' | 'TRASH' | 'NEEDS_REVIEW';

export type IntegrityStatus =
  | 'MATCHED'
  | 'MINOR_DIFFERENCE'
  | 'CRITICAL_DISCREPANCY';

// ---------------------------------------------------------------------------
// Data Contracts
// ---------------------------------------------------------------------------
export interface RawTransaction {
  date: string | null;
  amount: number | null;
  currency?: string | null;
  movementType?: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' | 'CHARGE' | 'UNKNOWN' | null;
  originalConcept: string | null;
  payerOrBeneficiaryName?: string | null;
  payerRfc?: string | null;
  referenceNumber?: string | null;
}

export interface StatementSummary {
  totalDepositsAmount?: number | null;
  totalDepositsCount?: number | null;
  totalWithdrawalsAmount?: number | null;
  totalWithdrawalsCount?: number | null;
  averageBalance?: number | null;
  endingBalance?: number | null;
}

export interface ClientFiscalContext {
  clientRfc?: string | null;
  clientFullName?: string | null;
  regimes?: Array<{ code?: string | null; description?: string | null }>;
  economicActivities?: string[];
}

export interface CleanedTransaction {
  date: string | null;
  amount: number;
  currency: string;
  originalConcept: string;
  payerOrBeneficiaryName: string | null;
  payerRfc: string | null;
  classification: TransactionClassification;
  trashCategory?: TrashCategory;
  validCategory?: ValidCategory;
  reason: string;
  confidenceScore: number;
  isHighImpactOutlier: boolean;
}

export interface IntegrityCheckResult {
  bankReportedTotal: number | null;
  calculatedDepositsTotal: number;
  discrepancy: number;
  status: IntegrityStatus;
  message: string;
}

export interface DepurationSummary {
  totalGrossDeposits: number;
  totalTrashDeposits: number;
  totalValidIncome: number;
  trashDepositsCount: number;
  validDepositsCount: number;
  needsReviewCount: number;
  detectedSector: EconomicSector;
}

export interface BankStatementCleanResult {
  integrityCheck: IntegrityCheckResult;
  depurationSummary: DepurationSummary;
  cleanedDeposits: CleanedTransaction[];
  highImpactExceptions: CleanedTransaction[];
}

// ---------------------------------------------------------------------------
// Deterministic Regex & Dictionaries
// ---------------------------------------------------------------------------
const TRASH_PATTERNS: Array<{
  category: TrashCategory;
  regex: RegExp;
  reason: string;
}> = [
  {
    category: 'LOAN_OR_CREDIT',
    regex:
      /\b(DISP(OSICION)?(\s+DE)?\s+(TDC|LINEA|CREDITO)|CREDITO(\s+(PERSONAL|NOMINA|AUTO|LIQUIDEZ))?|PRESTAMO|KUESKI|FINANCIERA|MERCADO\s*CREDITO|CREDI-NISSAN|FONDO\s+DE\s+CREDITO|DISP\s+TARJETA|DISP\s+CRED|DISPOSICION)\b/i,
    reason: 'Disposición de crédito o préstamo financiero',
  },
  {
    category: 'INVESTMENT_WITHDRAWAL',
    regex:
      /\b(PAGARE(\s+LIQ(UIDACION)?)?|LIQ(UIDACION)?\s+INVERSION|FONDO(S)?\s+INVERSION|RENDIMIENTO(S)?|INTERES(ES)?\s+GANADO(S)?|CETE(S)?|VTA\s+ACCIONES|RETIRO\s+DE\s+FONDOS|RETIRO\s+INVERSION|RETIRO\s+PAGARE|VENTA\s+DE\s+VALORES)\b/i,
    reason: 'Liquidación o rendimientos de fondo de inversión/pagaré',
  },
  {
    category: 'REFUND_OR_REVERSAL',
    regex:
      /\b(DEVOLUCION(\s+SAT|\s+IMPUESTOS)?|REEMBOLSO|CANCELACION|BONIFICACION|RECLAMACION|SALDO\s+A\s+FAVOR\s+SAT|CHEQUE\s+DEVUELTO|REVERSO|AJUSTE\s+POR\s+CARGO|DEVOLUCION\s+COMPRA)\b/i,
    reason: 'Devolución, cancelación o reembolso tributario/bancario',
  },
  {
    category: 'INFORMAL_FAMILY',
    regex:
      /\b(PAPA|MAMA|HERMANO|FAMILIAR|CHELAS|FIESTA|CANDY|PADRINO|TANDA|REGALO|VAQUITA|APOYO\s+FAMILIAR|PRESTAME|PRESTAMO\s+AMIGO|PAGO\s+COMIDA|CUMPLE)\b/i,
    reason: 'Transferencia informal de carácter familiar o recreativo',
  },
  {
    category: 'DOWN_PAYMENT_SAVING',
    regex:
      /\b(ENGANCHE(\s+CASA|\s+DEPTO|\s+VIVIENDA|\s+AUTO)?|APORTACION\s+VIVIENDA|APARTADO\s+CASA|APARTADO\s+VIVIENDA|AHORRO\s+ENGANCHE)\b/i,
    reason: 'Depósito etiquetado para enganche o apartado patrimonial',
  },
];

const VALID_PATTERNS: Array<{
  category: ValidCategory;
  regex: RegExp;
  reason: string;
}> = [
  {
    category: 'TPV_LIQUIDATION',
    regex:
      /\b(LIQ(UIDACION)?\s*TPV|CLIP|MERCADOPAGO|MP\s*\*|STRIPE|IZETTLE|ZETTLE|TERMINAL(\s+POS)?|VENTA\s+POS|PROSA|MIT|COBRO\s+TARJETA|PAYPAL\s+TRANSFER|LIQ\s+TARJETAS|ABONO\s+TPV|BBVA\s+TPV|TERMINAL\s+BANCARIA|SUMUP|BILLPOCKET)\b|EVOPAY|VENTAS\s+NETAS\s+D\s+TAR/i,
    reason: 'Liquidación de cobros por Terminal Punto de Venta (TPV / Agregador)',
  },
  {
    category: 'COMMERCIAL_SPEI',
    regex:
      /\b(HONORARIOS|SERV(ICIOS)?\s*PROF(ESIONALES)?|PAGO\s*DE\s*SERV|FACTURA(\s+NO|\s+FOLIO)?|FAC-|FOLIO\s*FAC|ABONO\s*CLIENTE|ANTICIPO\s*CLIENTE|PAGO\s*CLIENTE|FINIQUITO\s*CLIENTE|COBRO\s*SERVICIO)\b/i,
    reason: 'Pago comercial / facturación de servicios profesionales o clientes',
  },
  {
    category: 'RECURRENT_CASH',
    regex:
      /\b(DEP(OSITO)?\s*(EN)?\s*(VENTANILLA|PRACTICAJA|SUCURSAL|EFECTIVO)|ABONO\s*EFECTIVO|DEPOSITO\s*EN\s*EFECTIVO)\b/i,
    reason: 'Depósito en efectivo en ventanilla / practicaja bancaria',
  },
];

const SECTOR_KEYWORDS: Record<
  Exclude<EconomicSector, 'GENERAL_COMMERCE'>,
  { keywords: RegExp; insurancePayers?: RegExp; description: string }
> = {
  HEALTH_MEDICAL: {
    keywords:
      /\b(CONSULTA(\s+MEDICA)?|CIRUGIA|PROCEDIMIENTO|TRATAMIENTO|HONORARIOS\s+MEDICOS|PACIENTE|ECOGRAFIA|VALORACION|HOSPITAL|CLINICA|DENTAL|ODONTOL|MEDICINA|CIRUJANO|CONSULTORIO|ESTUDIO\s+LAB)\b/i,
    insurancePayers:
      /\b(GNP|AXA|METLIFE|SEGUROS\s+MONTERREY|MONTERREY\s+NEW\s+YORK|QUALITAS|INBURSA\s+SEGUROS|BANORTE\s+SEGUROS|MAPFRE|PLAN\s+SEGURO|ALLIANZ|SEGUROS\s+ATLAS|CHUBB)\b/i,
    description: 'Honorarios médicos, consultas o liquidación de aseguradora GMM',
  },
  PROFESSIONAL_SERVICES: {
    keywords:
      /\b(HONORARIOS|ASESORIA|CONSULTORIA|POLIZA(\s+MENSUAL)?|DICTAMEN|AUDITORIA|LEGAL|LITIGIO|DESARROLLO|SOFTWARE|SPRINT|SOPORTE\s+TI|CONTABILIDAD)\b/i,
    description: 'Honorarios por consultoría, servicios legales o profesionales',
  },
  FOOD_RESTAURANT: {
    keywords:
      /\b(EVENTO|BANQUETE|CATERING|PEDIDO|CONSUMO|UBER(\s+EATS)?|RAPPI|DIDI(\s+FOOD)?|RESTAURANTE|BANQUETES)\b/i,
    description: 'Ventas de alimentos, consumo o plataformas de entrega',
  },
  RENTAL: {
    keywords:
      /\b(RENTA|ARRENDAMIENTO|PAGO\s+RENTA|PAGO\s+LOCAL|PAGO\s+DEPTO|INQUILINO|ARRENDATARIO|ALQUILER)\b/i,
    description: 'Ingreso por arrendamiento inmobiliario',
  },
  CONSTRUCTION_TRADE: {
    keywords:
      /\b(ANTICIPO\s+OBRA|ESTIMACION(\s+\d+)?|MATERIAL\s+Y\s+MANO\s+DE\s+OBRA|PROYECTO\s+ARQ|REMODELACION|PLANOS|FINIQUITO\s+OBRA|SUPERVISION\s+OBRA)\b/i,
    description: 'Estimación, proyecto arquitectónico o anticipo de obra',
  },
};

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------
@Injectable()
export class BankStatementCleanerService {
  private readonly logger = new Logger(BankStatementCleanerService.name);

  /**
   * Main entry point to clean bank statement transactions deterministically.
   */
  clean(
    transactions: RawTransaction[],
    summary: StatementSummary = {},
    clientContext: ClientFiscalContext = {},
  ): BankStatementCleanResult {
    // 1. Detect economic sector from CSF
    const detectedSector = this.detectSector(clientContext.economicActivities || []);

    // 2. Filter raw transactions to deposits only (strictly exclude withdrawals/charges)
    const deposits = (transactions || []).filter((t) => {
      const type = (t.movementType || '').toUpperCase().trim();
      const isExplicitWithdrawal =
        type === 'WITHDRAWAL' ||
        type === 'CHARGE' ||
        type === 'RETIRO' ||
        type === 'CARGO' ||
        type === 'EGRESO';
      if (isExplicitWithdrawal) return false;

      const isDepositType =
        type === 'DEPOSIT' ||
        type === 'ABONO' ||
        type === 'CREDIT' ||
        type === 'INGRESO' ||
        !type;
      const isPositiveAmount = typeof t.amount === 'number' && t.amount > 0;
      return isDepositType && isPositiveAmount;
    });

    const totalGrossDeposits = deposits.reduce(
      (sum, d) => sum + (d.amount || 0),
      0,
    );

    // 3. Mathematical Reconciliation Check
    const integrityCheck = this.performIntegrityCheck(
      totalGrossDeposits,
      summary.totalDepositsAmount,
    );

    // 4. Classify each deposit deterministically
    const cleanedDeposits: CleanedTransaction[] = [];
    const highImpactExceptions: CleanedTransaction[] = [];

    let totalTrashDeposits = 0;
    let totalValidIncome = 0;
    let trashCount = 0;
    let validCount = 0;
    let needsReviewCount = 0;

    for (const dep of deposits) {
      const amount = dep.amount || 0;
      const concept = (dep.originalConcept || '').trim();
      const payerName = (dep.payerOrBeneficiaryName || '').trim();
      const payerRfc = (dep.payerRfc || '').trim();
      const currency = dep.currency || 'MXN';

      const classification = this.classifySingleDeposit(
        amount,
        concept,
        payerName,
        payerRfc,
        totalGrossDeposits,
        clientContext,
        detectedSector,
      );

      const cleanedTx: CleanedTransaction = {
        date: dep.date || null,
        amount,
        currency,
        originalConcept: concept,
        payerOrBeneficiaryName: payerName || null,
        payerRfc: payerRfc || null,
        classification: classification.classification,
        trashCategory: classification.trashCategory,
        validCategory: classification.validCategory,
        reason: classification.reason,
        confidenceScore: classification.confidenceScore,
        isHighImpactOutlier: classification.isHighImpactOutlier,
      };

      cleanedDeposits.push(cleanedTx);

      if (cleanedTx.classification === 'TRASH') {
        totalTrashDeposits += amount;
        trashCount++;
      } else if (cleanedTx.classification === 'VALID') {
        totalValidIncome += amount;
        validCount++;
      } else {
        // NEEDS_REVIEW
        needsReviewCount++;
      }

      if (cleanedTx.isHighImpactOutlier || cleanedTx.classification === 'NEEDS_REVIEW') {
        highImpactExceptions.push(cleanedTx);
      }
    }

    const depurationSummary: DepurationSummary = {
      totalGrossDeposits: Math.round(totalGrossDeposits * 100) / 100,
      totalTrashDeposits: Math.round(totalTrashDeposits * 100) / 100,
      totalValidIncome: Math.round(totalValidIncome * 100) / 100,
      trashDepositsCount: trashCount,
      validDepositsCount: validCount,
      needsReviewCount,
      detectedSector,
    };

    return {
      integrityCheck,
      depurationSummary,
      cleanedDeposits,
      highImpactExceptions,
    };
  }

  /**
   * Deterministically classifies a single deposit.
   */
  classifySingleDeposit(
    amount: number,
    concept: string,
    payerName: string,
    payerRfc: string,
    totalMonthlyDeposits: number,
    clientContext: ClientFiscalContext,
    detectedSector: EconomicSector,
  ): {
    classification: TransactionClassification;
    trashCategory?: TrashCategory;
    validCategory?: ValidCategory;
    reason: string;
    confidenceScore: number;
    isHighImpactOutlier: boolean;
  } {
    const fullText = `${concept} ${payerName} ${payerRfc}`.toUpperCase();

    // ── 1. RULE ZERO: Own Transfers ───────────────────────────────────────
    if (this.isOwnTransfer(fullText, payerName, payerRfc, clientContext)) {
      return {
        classification: 'TRASH',
        trashCategory: 'OWN_TRANSFER',
        reason: 'Traspaso entre cuentas propias del solicitante',
        confidenceScore: 1.0,
        isHighImpactOutlier: false,
      };
    }

    // ── 2. BLACKLIST: Trash Keywords (Loans, Refunds, Investments, etc.) ───
    for (const pattern of TRASH_PATTERNS) {
      if (pattern.regex.test(fullText)) {
        return {
          classification: 'TRASH',
          trashCategory: pattern.category,
          reason: pattern.reason,
          confidenceScore: 0.95,
          isHighImpactOutlier: false,
        };
      }
    }

    // ── 3. RENTAL INCOME (Conditional to CSF Regime 606) ───────────────────
    const isRentalConcept = /\b(RENTA|ARRENDAMIENTO|PAGO\s+RENTA|PAGO\s+DEPTO|PAGO\s+LOCAL|INQUILINO)\b/i.test(
      fullText,
    );
    if (isRentalConcept) {
      const hasArrendamiento = this.hasArrendamientoRegime(clientContext.regimes);
      if (hasArrendamiento) {
        return {
          classification: 'VALID',
          validCategory: 'RENTAL_WITH_REGIME',
          reason: 'Ingreso por arrendamiento amparado en CSF (Régimen 606)',
          confidenceScore: 0.95,
          isHighImpactOutlier: false,
        };
      } else {
        return {
          classification: 'TRASH',
          trashCategory: 'RENT_WITHOUT_CSF_REGIME',
          reason:
            'Depósito por renta descartado: el cliente no cuenta con Régimen de Arrendamiento en su CSF',
          confidenceScore: 0.9,
          isHighImpactOutlier: false,
        };
      }
    }

    // ── 4. SECTOR-SPECIFIC DICTIONARIES (e.g. Medical, Health Insurances) ──
    if (detectedSector !== 'GENERAL_COMMERCE') {
      const sectorConfig = SECTOR_KEYWORDS[detectedSector];
      if (sectorConfig) {
        if (sectorConfig.insurancePayers && sectorConfig.insurancePayers.test(fullText)) {
          return {
            classification: 'VALID',
            validCategory: 'SECTOR_SPECIFIC_INCOME',
            reason: `${sectorConfig.description} (Aseguradora GMM identificada)`,
            confidenceScore: 0.95,
            isHighImpactOutlier: false,
          };
        }
        if (sectorConfig.keywords.test(fullText)) {
          return {
            classification: 'VALID',
            validCategory: 'SECTOR_SPECIFIC_INCOME',
            reason: sectorConfig.description,
            confidenceScore: 0.9,
            isHighImpactOutlier: false,
          };
        }
      }
    }

    // ── 5. WHITELIST: TPV, Aggregators & Commercial SPEI ───────────────────
    for (const pattern of VALID_PATTERNS) {
      if (pattern.regex.test(fullText)) {
        return {
          classification: 'VALID',
          validCategory: pattern.category,
          reason: pattern.reason,
          confidenceScore: 0.95,
          isHighImpactOutlier: false,
        };
      }
    }

    // ── 6. OUTLIER / HIGH IMPACT DETECTION ────────────────────────────────
    // High concentration: single deposit >= 25% of month total
    const isConcentratedOutlier =
      totalMonthlyDeposits > 0 && amount / totalMonthlyDeposits >= 0.25 && amount >= 20000;
    
    // Large ambiguous transfer: > $50,000 without clear commercial concept
    const isLargeAmbiguous = amount >= 50000 && !/\b(FAC|PAGO|SERV|TPV|CLIP|VENTA)\b/i.test(fullText);

    if (isConcentratedOutlier || isLargeAmbiguous) {
      return {
        classification: 'NEEDS_REVIEW',
        reason: isConcentratedOutlier
          ? `Depósito atípico concentrado (${Math.round((amount / totalMonthlyDeposits) * 100)}% del total del mes)`
          : 'Depósito de alto monto sin concepto comercial evidente',
        confidenceScore: 0.5,
        isHighImpactOutlier: true,
      };
    }

    // ── 7. DEFAULT: General Valid Income ──────────────────────────────────
    return {
      classification: 'VALID',
      validCategory: 'GENERAL_INCOME',
      reason: 'Abono recibido en cuenta operativa sin marcas de descarte',
      confidenceScore: 0.85,
      isHighImpactOutlier: false,
    };
  }

  /**
   * Rule Zero: detects own transfers between accounts of the same client.
   */
  private isOwnTransfer(
    fullText: string,
    payerName: string,
    payerRfc: string,
    clientContext: ClientFiscalContext,
  ): boolean {
    // 1. Generic own-transfer phrases
    if (
      /\b(MIS\s+CUENTAS|TRASPASO\s+(ENTRE\s+)?CUENTAS|TRASPASO\s+PROPIO|MISMO\s+TITULAR|SPEI\s+A\s+MI\s+NOMBRE|RETIRO\/DEPOSITO\s+PROPIO|CUENTA\s+PROPIA)\b/i.test(
        fullText,
      )
    ) {
      return true;
    }

    // 2. Client RFC match
    const cleanClientRfc = (clientContext.clientRfc || '')
      .trim()
      .toUpperCase();
    if (
      cleanClientRfc &&
      cleanClientRfc.length >= 10 &&
      (payerRfc.toUpperCase().includes(cleanClientRfc) ||
        fullText.includes(cleanClientRfc))
    ) {
      return true;
    }

    // 3. Client Full Name match (Normalized)
    const cleanClientName = this.normalizeName(clientContext.clientFullName || '');
    const cleanPayerName = this.normalizeName(payerName);

    if (cleanClientName && cleanPayerName && cleanClientName.length >= 6) {
      if (
        cleanPayerName.includes(cleanClientName) ||
        cleanClientName.includes(cleanPayerName)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if the client has active Regime 606 (Arrendamiento).
   */
  private hasArrendamientoRegime(
    regimes?: Array<{ code?: string | null; description?: string | null } | string>,
  ): boolean {
    if (!regimes || !Array.isArray(regimes)) return false;
    return regimes.some((r) => {
      if (typeof r === 'string') {
        return r.includes('606') || /arrendamiento/i.test(r) || /alquiler/i.test(r);
      }
      return (
        r.code === '606' ||
        (Boolean(r.description) && /arrendamiento/i.test(r.description!))
      );
    });
  }

  /**
   * Detects the economic sector based on SAT economic activities text.
   */
  detectSector(economicActivities: string[]): EconomicSector {
    if (!economicActivities || economicActivities.length === 0) {
      return 'GENERAL_COMMERCE';
    }

    const combinedText = this.normalizeName(economicActivities.join(' '));

    if (
      /(MEDICIN|SALUD|HOSPITAL|ODONTOL|DENTIST|CLINIC|PSICOL|VETERINAR|MEDIC|CONSULTOR)/i.test(
        combinedText,
      )
    ) {
      return 'HEALTH_MEDICAL';
    }

    if (
      /(CONTAB|AUDITOR|JURIDIC|ABOGAD|SOFTWARE|SISTEMAS|CONSULTOR|INGENIER|ASESOR|LEGAL)/i.test(
        combinedText,
      )
    ) {
      return 'PROFESSIONAL_SERVICES';
    }

    if (
      /(RESTAURAN|ALIMENTO|COMIDA|BEBIDA|BAR|CAFETER|CATERING|PREPARACION DE ALIMENTOS)/i.test(
        combinedText,
      )
    ) {
      return 'FOOD_RESTAURANT';
    }

    if (/(ARRENDAMIENTO|INMUEBLE|ALQUILER)/i.test(combinedText)) {
      return 'RENTAL';
    }

    if (
      /(CONSTRUC|ALBANIL|ELECTRIC|ARQUITECT|INSTALAC|EDIFICACION|OBRA)/i.test(
        combinedText,
      )
    ) {
      return 'CONSTRUCTION_TRADE';
    }

    return 'GENERAL_COMMERCE';
  }

  /**
   * Verifies mathematical consistency between bank cover total and extracted transactions.
   */
  private performIntegrityCheck(
    calculatedTotal: number,
    bankReportedTotal?: number | null,
  ): IntegrityCheckResult {
    if (typeof bankReportedTotal !== 'number' || bankReportedTotal <= 0) {
      return {
        bankReportedTotal: null,
        calculatedDepositsTotal: calculatedTotal,
        discrepancy: 0,
        status: 'MATCHED',
        message: 'Total de carátula no disponible; suma calculada por renglones',
      };
    }

    const discrepancy = Math.abs(calculatedTotal - bankReportedTotal);
    const percentage =
      bankReportedTotal > 0 ? (discrepancy / bankReportedTotal) * 100 : 0;

    if (discrepancy <= 1.0) {
      return {
        bankReportedTotal,
        calculatedDepositsTotal: calculatedTotal,
        discrepancy: Math.round(discrepancy * 100) / 100,
        status: 'MATCHED',
        message: 'Conciliación matemática exacta con el estado de cuenta bancario',
      };
    }

    if (discrepancy <= 500.0 || percentage <= 1.0) {
      return {
        bankReportedTotal,
        calculatedDepositsTotal: calculatedTotal,
        discrepancy: Math.round(discrepancy * 100) / 100,
        status: 'MINOR_DIFFERENCE',
        message: `Diferencia menor de $${discrepancy.toFixed(2)} (${percentage.toFixed(2)}%) atribuible a redondeos o comisiones menores`,
      };
    }

    return {
      bankReportedTotal,
      calculatedDepositsTotal: calculatedTotal,
      discrepancy: Math.round(discrepancy * 100) / 100,
      status: 'CRITICAL_DISCREPANCY',
      message: `Discrepancia crítica: El banco reporta $${bankReportedTotal.toLocaleString()} y se extrajeron $${calculatedTotal.toLocaleString()} (diferencia de $${discrepancy.toLocaleString()}). Posible hoja faltante o lectura incompleta.`,
    };
  }

  /**
   * Helper to normalize names for similarity comparison.
   */
  private normalizeName(name: string): string {
    return (name || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
