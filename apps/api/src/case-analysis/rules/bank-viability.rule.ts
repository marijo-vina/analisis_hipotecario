import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AnalysisOutcome } from '../../generated/prisma/client';
import type {
  AnalysisRule,
  RuleResult,
  Severity,
} from '../analysis-rule.interface';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  BankViabilitySnapshot,
  BankViabilityInputs,
  BankarizationFlags,
  BankResult,
  BankResultCalculation,
  BankPolicySnapshot,
  ProductMatchStatus,
  CheckResult,
  CaseAnalysisContext,
  PfaeFactorMode,
  TaxReturnPolicy,
} from '../types/bank-viability.types';
import { completeMonthsBetween } from '../../shared/utils/dates';
import { matchActivityFactor } from '../activity-factor-match';
import {
  matchBankScopedNonSusceptibleActivity,
  matchGlobalNonSusceptibleActivity,
} from '../non-susceptible-activities';
import { pickPrimaryIndependentActivity } from '../../documents/csf-independent-activity';
import type { PfaeIncomeBases, PmIncomeBases } from '../../income-calculation/income-calculation.types';
import { decidePmBank, foldPmStatus, type PmBankDecision } from '../pm-comparison';
import {
  collectPmGatesInput,
  companyLegalForm,
  companyTenureMonths,
  type OwnedPmDocument,
} from '../pm-gates-input';
import { evaluatePmGates, type PmGatesResult } from '../pm-gates';

const WARNING_LEGEND =
  'Evaluación preliminar basada en la información disponible y en políticas internas registradas. No constituye una aprobación o autorización de crédito por parte del banco.';

const SOURCE_VERSION = 'ANAQUEL_AGOSTO_2026';

// ── Bureau Data ────────────────────────────────────────────────────────

interface BureauData {
  score: number | null;
  hasQuita: boolean;
  hasQuebranto: boolean;
  hasFraud: boolean;
  hasIdentityTheft: boolean;
  hasLegalAction: boolean;
  pastDueMonths: number | null;
  pastDueTotalAmount: number | null;
}

// ── Policy shape from Prisma findMany ────────────────────────────────────

interface PolicyWithBank {
  id: string;
  bankId: string;
  code: string;
  destination: string;
  minimumIncome: Prisma.Decimal | null;
  minimumPropertyValue: Prisma.Decimal | null;
  minimumEmploymentTenureMonths: number | null;
  minimumApplicantAgeMonths: number | null;
  maximumApplicationAgeMonths: number | null;
  minimumActivityTenureMonths: number | null;
  minimumIncomePfae: Prisma.Decimal | null;
  minimumApplicantAgeMonthsPfae: number | null;
  isActive: boolean;
  bank: {
    id: string;
    code: string;
    name: string;
    debtCommitmentFactor: Prisma.Decimal;
    incomeCriterion: string;
    minimumBureauScore: number | null;
    isActive: boolean;
    sourceVersion: string;
    pfaeFactorMode: string;
    pfaeFlatFactor: Prisma.Decimal | null;
    taxReturnPolicy: string;
    activityFactors: Array<{
      nativeLabel: string;
      satAliases: unknown;
      factor: Prisma.Decimal | { toString(): string } | number;
      factorTaxReturn: Prisma.Decimal | { toString(): string } | number | null;
    }>;
  };
}

interface PfaeBranch {
  personType: string;
  source: string | null;
  bases: PfaeIncomeBases | null;
  satDescription: string | null;
  independentDescription: string | null;
  activityStartDate: string | null;
}

interface PmComparisonContext {
  bases: PmIncomeBases | null;
  gates: PmGatesResult;
  legalForm: string | null;
  companyTenureMonths: number | null;
}

/** Round a Decimal to 2 decimal places (financial precision). */
function d2(v: Prisma.Decimal): string {
  return v.toFixed(2);
}

@Injectable()
export class BankViabilityRule implements AnalysisRule {
  readonly ruleId = 'bank-viability';

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    context: Record<string, unknown>,
    documents: Record<string, unknown>[],
  ): Promise<RuleResult> {
    const ctx = context as unknown as CaseAnalysisContext;
    const caseId = ctx.caseId;
    const calculatedAt = new Date();

    // ── 1. Input Resolution ──────────────────────────────────────────────
    const mortgageCase = await this.prisma.mortgageCase.findUnique({
      where: { id: caseId },
      select: {
        requestedAmount: true,
        propertyValue: true,
        estimatedTermMonths: true,
        creditTypeId: true,
        personType: true,
        sharePercentage: true,
        incorporationDate: true,
        legalName: true,
        companyRfc: true,
      },
    });

    const creditTypeId = mortgageCase?.creditTypeId ?? 0;

    const [incomeCalc, liabilitySnap, creditType] = await Promise.all([
      this.prisma.incomeCalculation.findFirst({
        where: { mortgageCaseId: caseId },
        orderBy: { calculatedAt: 'desc' },
        select: {
          confirmedGrossIncome: true,
          confirmedNetIncome: true,
          averageGrossIncome: true,
          averageNetIncome: true,
          receiptResults: true,
          calculatedAt: true,
          source: true,
          bases: true,
        },
      }),
      this.prisma.liabilitySnapshot.findFirst({
        where: { mortgageCaseId: caseId },
        orderBy: { calculatedAt: 'desc' },
      }),
      this.prisma.creditType.findUnique({
        where: { id: creditTypeId },
      }),
    ]);

    const destination = (creditType?.destination as string) ?? null;
    const creditTypeCode = creditType?.code ?? 'UNKNOWN';
    const personType = (mortgageCase as { personType?: string } | null)?.personType ?? 'SALARIED';
    const incomeSource = (incomeCalc as { source?: string } | null)?.source ?? null;
    const incomeBases = ((incomeCalc as { bases?: PfaeIncomeBases | null } | null)?.bases ??
      null) as PfaeIncomeBases | null;
    const csfFields = this.deriveCsfFields(documents);
    const satDescription = incomeBases?.activity?.description ?? csfFields.satDescription;

    const requestedAmount = mortgageCase?.requestedAmount ?? null;
    const propertyValue = mortgageCase?.propertyValue ?? null;
    const estimatedTermMonths = mortgageCase?.estimatedTermMonths ?? null;

    // Income fallback: confirmed → average → null
    const confirmedGrossIncome = incomeCalc?.confirmedGrossIncome ?? incomeCalc?.averageGrossIncome ?? null;
    const confirmedNetIncome = incomeCalc?.confirmedNetIncome ?? incomeCalc?.averageNetIncome ?? null;
    const totalMonthlyLiabilities = liabilitySnap?.grossCurrentMonthlyDebt ?? null;

    // ── Derive birthDate from INE extraction (documents array) ─────────
    const birthDate = this.deriveBirthDate(documents);

    // ── Derive employmentStartDate from payroll receipts ─────────────
    const { employmentStartDate, conflictingDates } =
      await this.deriveEmploymentStartDate(caseId, incomeCalc);

    // ── Derive Scotiabank flags from Phase A context ────────────────────
    const bankarizationFlags = (ctx as Record<string, unknown>).bankarizationFlags as BankarizationFlags | undefined;
    const { hasPagadoraIncome, scotiabankExcluded } =
      this.deriveScotiabankFlags(bankarizationFlags);

    // ── Build inputs ─────────────────────────────────────────────────
    const inputs: BankViabilityInputs = {
      confirmedGrossIncome: confirmedGrossIncome?.toString() ?? null,
      confirmedNetIncome: confirmedNetIncome?.toString() ?? null,
      totalMonthlyLiabilities: totalMonthlyLiabilities?.toString() ?? null,
      requestedAmount: requestedAmount?.toString() ?? null,
      propertyValue: propertyValue?.toString() ?? null,
      estimatedTermMonths,
      birthDate,
      employmentStartDate,
      hasPagadoraIncome,
      scotiabankExcluded,
      personType,
      incomeSource,
    };

    // ── Global reasons ───────────────────────────────────────────────
    const globalReasons: string[] = [];
    if (!destination) globalReasons.push('UNSUPPORTED_DESTINATION');
    if (!birthDate) globalReasons.push('MISSING_BIRTH_DATE');
    if (conflictingDates) globalReasons.push('CONFLICTING_EMPLOYMENT_DATES');

    // ── Bureau Data Extraction ────────────────────────────────────────
    const bureauData = this.extractBureauData(documents);

    // ── Universal Bureau Knockouts (short-circuit) ────────────────────
    if (bureauData) {
      if (bureauData.score !== null && bureauData.score < 500) {
        globalReasons.push('BUREAU_SCORE_UNIVERSAL_REJECTION');
        const snapshot: BankViabilitySnapshot = {
          sourceVersion: SOURCE_VERSION,
          creditTypeCode,
          destination,
          calculatedAt: calculatedAt.toISOString(),
          warningLegend: WARNING_LEGEND,
          reasons: globalReasons,
          inputs,
          bankResults: [],
        };
        return {
          ruleId: this.ruleId,
          outcome: 'FAIL' as AnalysisOutcome,
          severity: 'ERROR' as Severity,
          detail: {
            sources: ['mortgage-case', 'income-calculation', 'liability-snapshot', 'bank-catalog', 'bureau-data'],
            fields: [],
            bankViability: snapshot,
          } as never,
          alerts: [],
        };
      }
      if (
        bureauData.hasQuita ||
        bureauData.hasQuebranto ||
        bureauData.hasFraud ||
        bureauData.hasIdentityTheft ||
        bureauData.hasLegalAction
      ) {
        if (bureauData.hasFraud || bureauData.hasIdentityTheft) {
          globalReasons.push('FRAUD_OR_IDENTITY_THEFT_REJECTED');
        } else if (bureauData.hasLegalAction) {
          globalReasons.push('LEGAL_ACTION_REJECTED');
        } else {
          globalReasons.push('QUITA_QUEBRANTO_REJECTED');
        }
        const snapshot: BankViabilitySnapshot = {
          sourceVersion: SOURCE_VERSION,
          creditTypeCode,
          destination,
          calculatedAt: calculatedAt.toISOString(),
          warningLegend: WARNING_LEGEND,
          reasons: globalReasons,
          inputs,
          bankResults: [],
        };
        return {
          ruleId: this.ruleId,
          outcome: 'FAIL' as AnalysisOutcome,
          severity: 'ERROR' as Severity,
          detail: {
            sources: ['mortgage-case', 'income-calculation', 'liability-snapshot', 'bank-catalog', 'bureau-data'],
            fields: [],
            bankViability: snapshot,
          } as never,
          alerts: [],
        };
      }
    }

    // ── PFAE Non-Susceptible Activity Knockout (short-circuit) ──────────
    if (personType === 'PFAE') {
      const exclusion = matchGlobalNonSusceptibleActivity(csfFields.independentDescription);
      if (exclusion.kind === 'excluded') {
        globalReasons.push('ACTIVITY_NOT_SUSCEPTIBLE');
        const snapshot: BankViabilitySnapshot = {
          sourceVersion: SOURCE_VERSION,
          creditTypeCode,
          destination,
          calculatedAt: calculatedAt.toISOString(),
          warningLegend: WARNING_LEGEND,
          reasons: globalReasons,
          inputs,
          bankResults: [],
          nonSusceptibleActivity: exclusion.label,
        };
        return {
          ruleId: this.ruleId,
          outcome: 'FAIL' as AnalysisOutcome,
          severity: 'ERROR' as Severity,
          detail: {
            sources: ['mortgage-case', 'income-calculation', 'liability-snapshot', 'csf'],
            fields: [],
            bankViability: snapshot,
          } as never,
          alerts: [],
        };
      }
    }

    // ── 2. Policy Query ────────────────────────────────────────────────
    let policies: PolicyWithBank[] = [];
    if (destination) {
      policies = await this.prisma.bankPolicy.findMany({
        where: {
          isActive: true,
          destination: destination as never,
          bank: { isActive: true },
        },
        include: { bank: { include: { activityFactors: true } } },
      });
    }

    // ── 3. Evaluate each policy ──────────────────────────────────────
    const currentAgeMonths = birthDate
      ? completeMonthsBetween(birthDate, calculatedAt)
      : null;

    const bankResults: BankResult[] = [];

    const pfaeBranch: PfaeBranch = {
      personType,
      source: incomeSource,
      bases: incomeBases,
      satDescription,
      independentDescription: csfFields.independentDescription,
      activityStartDate: csfFields.activityStartDate,
    };
    const pmContext =
      personType === 'PM'
        ? this.pmComparisonContext(
            mortgageCase,
            documents,
            incomeBases,
            destination,
            calculatedAt,
          )
        : null;

    for (const policy of policies) {
      const result = this.evaluateBank(
        policy,
        inputs,
        currentAgeMonths,
        employmentStartDate,
        calculatedAt,
        hasPagadoraIncome,
        scotiabankExcluded,
        bureauData,
        propertyValue,
        pfaeBranch,
        pmContext,
      );
      bankResults.push(result);
    }

    // ── 4. Aggregate Outcome ─────────────────────────────────────────
    const outcome = this.computeAggregateOutcome(bankResults, destination);

    // ── 5. Build Snapshot ────────────────────────────────────────────
    const snapshot: BankViabilitySnapshot = {
      sourceVersion: SOURCE_VERSION,
      creditTypeCode,
      destination,
      calculatedAt: calculatedAt.toISOString(),
      warningLegend: WARNING_LEGEND,
      reasons: globalReasons,
      inputs,
      bankResults,
    };

    const severity: Severity =
      outcome === 'FAIL' ? 'ERROR' : outcome === 'PARTIAL' ? 'WARNING' : 'INFO';

    return {
      ruleId: this.ruleId,
      outcome,
      severity,
      detail: {
        sources: ['mortgage-case', 'income-calculation', 'liability-snapshot', 'bank-catalog'],
        fields: [],
        bankViability: snapshot,
      } as never,
      alerts: [],
    };
  }

  // ── Bureau Data Extraction (from documents array) ────────────────────

  private extractBureauData(documents: Record<string, unknown>[]): BureauData | null {
    let score: number | null = null;
    let hasQuita = false;
    let hasQuebranto = false;
    let hasFraud = false;
    let hasIdentityTheft = false;
    let hasLegalAction = false;
    let pastDueMonths: number | null = null;
    let pastDueTotalAmount: number | null = null;
    let foundAnyBureauDoc = false;

    for (const doc of documents) {
      const ed = doc.extractedData as Record<string, unknown> | null;
      const pr = doc.processingResults as Record<string, unknown> | null;

      // Extract score if not found yet
      if (score === null) {
        const candidateScore =
          ed?.score ??
          pr?.score ??
          (ed?.creditData as Record<string, unknown> | null)?.score ??
          (pr?.creditData as Record<string, unknown> | null)?.score ??
          (ed?.bureauData as Record<string, unknown> | null)?.score ??
          (ed?.creditData as Record<string, unknown> | null)?.bureauScore ??
          (ed?.creditData as Record<string, unknown> | null)?.bcScore ??
          (ed?.report as Record<string, unknown> | null)?.publicScore ??
          (pr?.report as Record<string, unknown> | null)?.publicScore ??
          (ed?.scoreData as Record<string, unknown> | null)?.score ??
          (ed?.scoreData as Record<string, unknown> | null)?.bureauScore;

        if (candidateScore != null) {
          const numScore = Number(candidateScore);
          if (!isNaN(numScore) && numScore > 0) {
            score = numScore;
          }
        }
      }

      // Check for credit bureau document type — creditData can be in extractedData or processingResults
      const creditData = (ed?.creditData ?? ed?.bureauData ?? pr?.creditData) as Record<string, unknown> | null;
      const riskSummary = (ed?.riskSummary ?? pr?.riskSummary) as Record<string, unknown> | null;
      const credits = (ed?.credits ?? pr?.credits) as Record<string, unknown>[] | undefined;

      if (creditData || riskSummary || credits || ed?.score != null || pr?.score != null) {
        foundAnyBureauDoc = true;
        if (!hasFraud) {
          hasFraud = !!(
            riskSummary?.hasFraudFlag ??
            credits?.some((c) => c.hasFraudFlag === true)
          );
        }
        if (!hasIdentityTheft) {
          hasIdentityTheft = !!(
            riskSummary?.hasIdentityTheft ??
            credits?.some((c) => c.hasIdentityTheft === true)
          );
        }
        if (!hasLegalAction) {
          hasLegalAction = !!(
            riskSummary?.hasLegalAction ??
            credits?.some((c) => c.hasLegalAction === true)
          );
        }
        if (!hasQuita) {
          hasQuita = !!(
            creditData?.hasQuita ??
            creditData?.hasSettlement ??
            riskSummary?.hasSettlementOrDiscount ??
            credits?.some((c) => c.hasSettlementOrDiscount === true)
          );
        }
        if (!hasQuebranto) {
          hasQuebranto = !!(
            creditData?.hasQuebranto ??
            creditData?.hasWriteOff ??
            riskSummary?.hasWriteOff ??
            credits?.some((c) => c.hasWriteOff === true)
          );
        }
        if (pastDueMonths === null) {
          pastDueMonths = (creditData?.pastDueMonths ?? creditData?.mopCount) as number | null;
        }
        if (pastDueTotalAmount === null) {
          pastDueTotalAmount = (creditData?.pastDueTotalAmount ?? creditData?.pastDueAmount) as number | null;
        }
      }
    }

    if (!foundAnyBureauDoc && score === null) {
      return null;
    }

    return {
      score,
      hasQuita,
      hasQuebranto,
      hasFraud,
      hasIdentityTheft,
      hasLegalAction,
      pastDueMonths,
      pastDueTotalAmount,
    };
  }

  private deriveCsfFields(documents: Record<string, unknown>[]): {
    activityStartDate: string | null;
    satDescription: string | null;
    independentDescription: string | null;
  } {
    let activityStartDate: string | null = null;
    let satDescription: string | null = null;
    let independentDescription: string | null = null;
    for (const doc of documents) {
      const typeCode = (doc.documentType as { code?: string } | undefined)?.code;
      if (typeCode !== 'CSF') continue;
      const ed = (doc.extractedData as Record<string, unknown> | null) ?? {};
      const independent = pickPrimaryIndependentActivity(ed.activities);
      if (independent) independentDescription = independent.description;
      if (independent?.startDate) {
        activityStartDate = independent.startDate;
      } else if (typeof ed.activityStartDate === 'string') {
        activityStartDate = ed.activityStartDate;
      }
      if (!Array.isArray(ed.activities) || ed.activities.length === 0) continue;
      const active = ed.activities.filter((item): item is Record<string, unknown> => {
        if (item == null || typeof item !== 'object') return false;
        return (item as Record<string, unknown>).endDate == null;
      });
      let best: Record<string, unknown> | null = active[0] ?? null;
      let bestPct = typeof best?.percentage === 'number' ? best.percentage : -1;
      for (const item of active.slice(1)) {
        const pct = typeof item.percentage === 'number' ? item.percentage : -1;
        if (pct > bestPct) {
          best = item;
          bestPct = pct;
        }
      }
      if (typeof best?.description === 'string') {
        satDescription = best.description;
      }
    }
    return { activityStartDate, satDescription, independentDescription };
  }

  // ── Birth Date Derivation (from documents array) ───────────────────

  private deriveBirthDate(documents: Record<string, unknown>[]): string | null {
    for (const doc of documents) {
      const pr = doc.processingResults as Record<string, unknown> | null;
      const ed = doc.extractedData as Record<string, unknown> | null;

      const prIdentity = pr?.identity as Record<string, unknown> | undefined;
      const edIdentity = ed?.identity as Record<string, unknown> | undefined;

      const bd = (prIdentity?.birthDate as string) ?? (edIdentity?.birthDate as string) ?? null;
      if (bd) return bd;
    }
    return null;
  }

  // ── Employment Start Date Derivation ───────────────────────────────

  private async deriveEmploymentStartDate(
    caseId: string,
    incomeCalc: Record<string, unknown> | null,
  ): Promise<{ employmentStartDate: string | null; conflictingDates: boolean }> {
    if (!incomeCalc) {
      return { employmentStartDate: null, conflictingDates: false };
    }

    const receiptResults = incomeCalc.receiptResults;
    let receiptIds: string[] = [];

    if (typeof receiptResults === 'string') {
      try {
        const parsed = JSON.parse(receiptResults) as Record<string, unknown>[];
        receiptIds = parsed.map((r) => r.documentId as string).filter(Boolean);
      } catch {
        return { employmentStartDate: null, conflictingDates: false };
      }
    } else if (Array.isArray(receiptResults)) {
      receiptIds = (receiptResults as Record<string, unknown>[])
        .map((r) => r.documentId as string)
        .filter(Boolean);
    }

    if (receiptIds.length === 0) {
      return { employmentStartDate: null, conflictingDates: false };
    }

    const receipts = await this.prisma.document.findMany({
      where: { id: { in: receiptIds } },
      select: { id: true, extractedData: true },
    });

    const hireDates = new Set<string>();

    for (const receipt of receipts) {
      const ed = receipt.extractedData as Record<string, unknown> | null;
      // Payroll extraction normalizes to employment.hireDate; also check raw employee path
      const employment = ed?.employment as Record<string, unknown> | undefined;
      const employee = ed?.employee as Record<string, unknown> | undefined;
      const hireDate = (employment?.hireDate ?? employee?.hireDate) as string | undefined;
      if (hireDate) hireDates.add(hireDate);
    }

    if (hireDates.size === 0) return { employmentStartDate: null, conflictingDates: false };
    if (hireDates.size > 1) return { employmentStartDate: null, conflictingDates: true };

    return { employmentStartDate: Array.from(hireDates)[0], conflictingDates: false };
  }

  // ── Scotiabank Flags Derivation ────────────────────────────────────

  private deriveScotiabankFlags(
    flags?: BankarizationFlags,
  ): { hasPagadoraIncome: boolean; scotiabankExcluded: boolean } {
    return {
      hasPagadoraIncome: flags?.hasPagadoraIncome ?? false,
      scotiabankExcluded: flags?.scotiabankExcluded ?? false,
    };
  }

  private chosenPfaeBase(
    incomeCriterion: 'NET' | 'GROSS',
    pfae: PfaeBranch,
  ): Prisma.Decimal | null {
    if (!pfae.bases) return null;
    const base = pfae.source === 'TAX_RETURN' ? pfae.bases.taxReturn : pfae.bases.bank;
    if (!base?.valid) return null;
    const monthly = incomeCriterion === 'NET' ? base.monthlyNet : base.monthlyGross;
    if (monthly == null) return null;
    return new Prisma.Decimal(monthly);
  }

  private resolvePfaeFactor(
    bank: PolicyWithBank['bank'],
    source: string | null,
    satDescription: string | null,
  ): {
    factor: Prisma.Decimal | null;
    unmapped: boolean;
    factorMode: PfaeFactorMode;
    matchedNativeLabel: string | null;
  } {
    const mode = bank.pfaeFactorMode as PfaeFactorMode;
    if (mode === 'NONE') {
      return {
        factor: new Prisma.Decimal(1),
        unmapped: false,
        factorMode: 'NONE',
        matchedNativeLabel: null,
      };
    }
    if (mode === 'FLAT') {
      if (bank.pfaeFlatFactor == null) {
        return { factor: null, unmapped: false, factorMode: 'FLAT', matchedNativeLabel: null };
      }
      return {
        factor: new Prisma.Decimal(bank.pfaeFlatFactor.toString()),
        unmapped: false,
        factorMode: 'FLAT',
        matchedNativeLabel: null,
      };
    }
    const match = matchActivityFactor({
      pfaeFactorMode: 'MATRIX',
      satDescription,
      activityFactors: bank.activityFactors ?? [],
    });
    if (match.kind !== 'hit') {
      return { factor: null, unmapped: true, factorMode: 'MATRIX', matchedNativeLabel: null };
    }
    const raw =
      source === 'TAX_RETURN' && match.factorTaxReturn != null
        ? match.factorTaxReturn
        : match.factor;
    return {
      factor: new Prisma.Decimal(raw),
      unmapped: false,
      factorMode: 'MATRIX',
      matchedNativeLabel: match.nativeLabel,
    };
  }

  private resolveIncomeUsed(
    isPfae: boolean,
    incomeCriterion: 'NET' | 'GROSS',
    inputs: BankViabilityInputs,
    pfae: PfaeBranch,
    policy: PolicyWithBank,
  ): { incomeUsed: Prisma.Decimal | null; unmapped: boolean } {
    if (!isPfae) {
      const incomeUsedStr =
        incomeCriterion === 'NET' ? inputs.confirmedNetIncome : inputs.confirmedGrossIncome;
      return {
        incomeUsed: incomeUsedStr ? new Prisma.Decimal(incomeUsedStr) : null,
        unmapped: false,
      };
    }
    const chosen = this.chosenPfaeBase(incomeCriterion, pfae);
    const { factor, unmapped } = this.resolvePfaeFactor(
      policy.bank,
      pfae.source,
      pfae.satDescription,
    );
    if (unmapped) return { incomeUsed: null, unmapped: true };
    if (chosen == null || factor == null) return { incomeUsed: null, unmapped: false };
    return { incomeUsed: chosen.mul(factor), unmapped: false };
  }

  private pmComparisonContext(
    mortgageCase: {
      sharePercentage?: { toString(): string } | null;
      incorporationDate?: Date | null;
      estimatedTermMonths?: number | null;
      legalName?: string | null;
      companyRfc?: string | null;
    } | null,
    documents: Record<string, unknown>[],
    incomeBases: PfaeIncomeBases | null,
    destination: string | null,
    calculatedAt: Date,
  ): PmComparisonContext {
    const shareRaw = mortgageCase?.sharePercentage;
    const sharePercentage = shareRaw == null ? null : Number(shareRaw.toString());
    const docs = documents as OwnedPmDocument[];
    const facts = collectPmGatesInput(
      {
        asOf: calculatedAt,
        sharePercentage: Number.isFinite(sharePercentage) ? sharePercentage : null,
        incorporationDate: mortgageCase?.incorporationDate ?? null,
        estimatedTermMonths: mortgageCase?.estimatedTermMonths ?? null,
        destination,
        legalName: mortgageCase?.legalName ?? null,
        companyRfc: mortgageCase?.companyRfc ?? null,
      },
      docs,
    );
    const bases =
      incomeBases && (incomeBases as { profile?: string }).profile === 'PM'
        ? (incomeBases as unknown as PmIncomeBases)
        : null;
    return {
      bases,
      gates: evaluatePmGates(facts),
      legalForm: companyLegalForm(docs),
      companyTenureMonths: companyTenureMonths(facts.incorporationDate, calculatedAt),
    };
  }

  // ── Bank Evaluation ────────────────────────────────────────────────

  private evaluateBank(
    policy: PolicyWithBank,
    inputs: BankViabilityInputs,
    currentAgeMonths: number | null,
    employmentStartDate: string | null,
    calculatedAt: Date,
    hasPagadoraIncome: boolean,
    scotiabankExcluded: boolean,
    bureauData: BureauData | null,
    propertyValue: Prisma.Decimal | null,
    pfae: PfaeBranch,
    pm: PmComparisonContext | null,
  ): BankResult {
    const reasons: string[] = [];
    const checks: Record<string, CheckResult> = {};
    const isPfae = pfae.personType === 'PFAE';
    const pmDecision: PmBankDecision | null =
      pfae.personType === 'PM' && pm != null
        ? decidePmBank({
            bankCode: policy.bank.code,
            incomeSource: pfae.source,
            bases: pm.bases,
            gate: pm.gates.banks.find((bank) => bank.bankCode === policy.bank.code) ?? null,
            legalForm: pm.legalForm,
            companyTenureMonths: pm.companyTenureMonths,
          })
        : null;

    const incomeCriterion = policy.bank.incomeCriterion as 'NET' | 'GROSS';
    const debtCommitmentFactor = new Prisma.Decimal(
      pmDecision?.debtCommitmentFactor ?? policy.bank.debtCommitmentFactor.toString(),
    );

    // ── Income Selection (giro AFTER chosen base on both PFAE paths) ─
    let incomeUsed: Prisma.Decimal | null;
    let maximumDebt: Prisma.Decimal | null = null;
    let availableCapacity: Prisma.Decimal | null = null;

    if (pmDecision) {
      reasons.push(...pmDecision.reasons);
      incomeUsed =
        pmDecision.incomeUsed == null ? null : new Prisma.Decimal(pmDecision.incomeUsed);
      maximumDebt =
        pmDecision.maximumDebt == null ? null : new Prisma.Decimal(pmDecision.maximumDebt);
      availableCapacity =
        pmDecision.availableCapacity == null
          ? null
          : new Prisma.Decimal(pmDecision.availableCapacity);
      checks.capacity = {
        status: pmDecision.capacityStatus,
        availableCapacity: availableCapacity ? d2(availableCapacity) : null,
      };
    } else {
      const resolved = this.resolveIncomeUsed(
        isPfae,
        incomeCriterion,
        inputs,
        pfae,
        policy,
      );
      incomeUsed = resolved.incomeUsed;

      if (resolved.unmapped) {
        reasons.push('ACTIVITY_UNMAPPED');
      } else if (!incomeUsed) {
        reasons.push('UNCONFIRMED_INCOME');
      }

      if (isPfae && pfae.source === 'TAX_RETURN') {
        if (policy.bank.taxReturnPolicy === 'REJECTED') {
          reasons.push('TAX_RETURN_REJECTED');
        } else if (policy.bank.taxReturnPolicy === 'NOT_PREFERRED') {
          reasons.push('TAX_RETURN_NOT_PREFERRED');
        }
      }

      const liabilities = inputs.totalMonthlyLiabilities
        ? new Prisma.Decimal(inputs.totalMonthlyLiabilities)
        : new Prisma.Decimal(0);

      if (incomeUsed) {
        maximumDebt = incomeUsed.mul(debtCommitmentFactor);
        availableCapacity = maximumDebt.minus(liabilities);
      }

      const capacityPass = incomeUsed && availableCapacity && availableCapacity.gt(0);
      checks.capacity = {
        status: capacityPass ? 'PASS' : incomeUsed ? 'FAIL' : 'REQUIRES_REVIEW',
        availableCapacity: availableCapacity ? d2(availableCapacity) : null,
      };

      if (!capacityPass && incomeUsed) {
        reasons.push('NEGATIVE_CAPACITY');
      }
    }

    // ── Minimum Applicant Age Control ────────────────────────────────
    const minAgeMonths =
      isPfae && policy.minimumApplicantAgeMonthsPfae != null
        ? policy.minimumApplicantAgeMonthsPfae
        : policy.minimumApplicantAgeMonths;
    if (currentAgeMonths !== null && minAgeMonths !== null) {
      if (currentAgeMonths < minAgeMonths) {
        checks.minimumApplicantAge = {
          status: 'FAIL',
          actualMonths: currentAgeMonths,
          requiredMonths: minAgeMonths,
        };
        reasons.push('MINIMUM_AGE_NOT_MET');
      } else {
        checks.minimumApplicantAge = {
          status: 'PASS',
          actualMonths: currentAgeMonths,
          requiredMonths: minAgeMonths,
        };
      }
    } else if (minAgeMonths !== null) {
      // Policy exists but birth date data missing
      checks.minimumApplicantAge = { status: 'REQUIRES_REVIEW', reason: 'MISSING_BIRTH_DATE' };
    } else {
      checks.minimumApplicantAge = { status: 'NOT_APPLICABLE' };
    }

    // ── Maximum Application Age Control ──────────────────────────────
    if (currentAgeMonths !== null && policy.maximumApplicationAgeMonths !== null) {
      if (currentAgeMonths > policy.maximumApplicationAgeMonths) {
        checks.maximumApplicationAge = {
          status: 'FAIL',
          actualMonths: currentAgeMonths,
          maximumMonths: policy.maximumApplicationAgeMonths,
        };
        reasons.push('MAXIMUM_APPLICATION_AGE_EXCEEDED');
      } else {
        checks.maximumApplicationAge = {
          status: 'PASS',
          actualMonths: currentAgeMonths,
          maximumMonths: policy.maximumApplicationAgeMonths,
        };
      }
    } else if (policy.maximumApplicationAgeMonths !== null) {
      // Policy exists but birth date data missing
      checks.maximumApplicationAge = { status: 'REQUIRES_REVIEW', reason: 'MISSING_BIRTH_DATE' };
    } else {
      checks.maximumApplicationAge = { status: 'NOT_APPLICABLE' };
    }

    // ── Employment / activity tenure ──────────────────────────────────
    if (pmDecision) {
      checks.employmentTenure = { status: 'NOT_APPLICABLE' };
      checks.activityTenure = pmDecision.activityTenure as CheckResult;
    } else if (isPfae) {
      checks.employmentTenure = { status: 'NOT_APPLICABLE' };
      if (pfae.activityStartDate !== null && policy.minimumActivityTenureMonths !== null) {
        const tenureMonths = completeMonthsBetween(pfae.activityStartDate, calculatedAt);
        if (tenureMonths < policy.minimumActivityTenureMonths) {
          checks.activityTenure = {
            status: 'FAIL',
            actualMonths: tenureMonths,
            requiredMonths: policy.minimumActivityTenureMonths,
          };
          reasons.push('INSUFFICIENT_ACTIVITY_TENURE');
        } else {
          checks.activityTenure = {
            status: 'PASS',
            actualMonths: tenureMonths,
            requiredMonths: policy.minimumActivityTenureMonths,
          };
        }
      } else if (policy.minimumActivityTenureMonths !== null) {
        checks.activityTenure = { status: 'REQUIRES_REVIEW', reason: 'MISSING_ACTIVITY_START_DATE' };
        reasons.push('MISSING_ACTIVITY_START_DATE');
      } else {
        checks.activityTenure = { status: 'NOT_APPLICABLE' };
      }
    } else if (employmentStartDate !== null && policy.minimumEmploymentTenureMonths !== null) {
      const tenureMonths = completeMonthsBetween(employmentStartDate, calculatedAt);
      if (tenureMonths < policy.minimumEmploymentTenureMonths) {
        checks.employmentTenure = {
          status: 'FAIL',
          actualMonths: tenureMonths,
          requiredMonths: policy.minimumEmploymentTenureMonths,
        };
        reasons.push('INSUFFICIENT_EMPLOYMENT_TENURE');
      } else {
        checks.employmentTenure = {
          status: 'PASS',
          actualMonths: tenureMonths,
          requiredMonths: policy.minimumEmploymentTenureMonths,
        };
      }
    } else if (policy.minimumEmploymentTenureMonths !== null) {
      // Policy exists but employment data missing
      checks.employmentTenure = { status: 'REQUIRES_REVIEW', reason: 'MISSING_EMPLOYMENT_DATA' };
      reasons.push('MISSING_EMPLOYMENT_DATA');
    } else {
      checks.employmentTenure = { status: 'NOT_APPLICABLE' };
    }

    // ── Scotiabank Pagadora Exclusion ────────────────────────────────
    if (!pmDecision && policy.bank.code === 'SCOTIABANK' && hasPagadoraIncome && scotiabankExcluded) {
      reasons.push('SCOTIABANK_PAGADORA_EXCLUSION');
    }

    // ── Bank-scoped activity sheet (HSBC liquidity) ──────────────────
    const scopedExclusion = matchBankScopedNonSusceptibleActivity({
      description: pfae.independentDescription,
      bankCode: policy.bank.code,
      destination: policy.destination,
      personType: pfae.personType,
    });
    if (scopedExclusion.kind === 'excluded') {
      reasons.push('HSBC_LIQUIDITY_ACTIVITY_RESTRICTED');
    }

    // ── Bureau Score Check (bank-specific) ────────────────────────────
    if (policy.bank.minimumBureauScore != null) {
      const minScore = policy.bank.minimumBureauScore;
      const actualScore = bureauData?.score ?? null;
      if (actualScore !== null) {
        if (actualScore <= minScore) {
          checks.minimumBureauScore = {
            status: 'FAIL',
            actual: actualScore,
            required: minScore,
          };
          reasons.push(`${policy.bank.code}_SCORE_BELOW_THRESHOLD`);
        } else {
          checks.minimumBureauScore = {
            status: 'PASS',
            actual: actualScore,
            required: minScore,
          };
        }
      } else {
        checks.minimumBureauScore = {
          status: 'NOT_APPLICABLE',
          actual: null,
          required: minScore,
        };
      }
    } else {
      checks.minimumBureauScore = {
        status: 'NOT_APPLICABLE',
        actual: bureauData?.score ?? null,
      };
    }

    // ── Santander MOP Check ───────────────────────────────────────────
    if (bureauData && policy.bank.code === 'SANTANDER') {
      const pvMonths = bureauData.pastDueMonths ?? 0;
      const pvAmount = bureauData.pastDueTotalAmount ?? 0;
      if (pvMonths >= 3 || (pvMonths >= 2 && pvAmount > 3000)) {
        reasons.push('SANTANDER_MOP_KNOCKOUT');
      }
    }

    // ── Minimum Income CMA Check ──────────────────────────────────────
    const minIncome =
      isPfae && policy.minimumIncomePfae != null ? policy.minimumIncomePfae : policy.minimumIncome;
    if (minIncome !== null && incomeUsed) {
      const required = new Prisma.Decimal(minIncome.toString());
      if (incomeUsed.lt(required)) {
        checks.minimumIncome = {
          status: 'FAIL',
          actual: d2(incomeUsed),
          required: d2(required),
        };
        reasons.push('INCOME_BELOW_MINIMUM');
      } else {
        checks.minimumIncome = {
          status: 'PASS',
          actual: d2(incomeUsed),
          required: d2(required),
        };
      }
    } else if (minIncome !== null) {
      checks.minimumIncome = {
        status: 'REQUIRES_REVIEW',
        required: d2(new Prisma.Decimal(minIncome.toString())),
        reason: 'UNCONFIRMED_INCOME',
      };
    }

    // ── Minimum Property Value CMA Check ──────────────────────────────
    if (policy.minimumPropertyValue !== null && propertyValue) {
      const propValue = new Prisma.Decimal(propertyValue.toString());
      const minProp = new Prisma.Decimal(policy.minimumPropertyValue.toString());
      if (propValue.lt(minProp)) {
        checks.minimumPropertyValue = {
          status: 'FAIL',
          actual: d2(propValue),
          required: d2(minProp),
        };
        reasons.push('PROPERTY_VALUE_BELOW_MINIMUM');
      } else {
        checks.minimumPropertyValue = {
          status: 'PASS',
          actual: d2(propValue),
          required: d2(minProp),
        };
      }
    } else if (policy.minimumPropertyValue !== null) {
      checks.minimumPropertyValue = {
        status: 'REQUIRES_REVIEW',
        required: d2(new Prisma.Decimal(policy.minimumPropertyValue.toString())),
        reason: 'MISSING_PROPERTY_VALUE',
      };
    }

    // ── Status Precedence ────────────────────────────────────────────
    const status = pmDecision
      ? foldPmStatus(pmDecision.status, reasons, checks)
      : this.resolveProductStatus(checks, reasons, !incomeUsed, currentAgeMonths === null);

    // ── Calculation ──────────────────────────────────────────────────
    const ageAtMaturityMonths =
      currentAgeMonths !== null ? currentAgeMonths + (inputs.estimatedTermMonths ?? 0) : null;

    const calculation: BankResultCalculation = {
      incomeUsed: incomeUsed ? d2(incomeUsed) : null,
      maximumDebt: maximumDebt ? d2(maximumDebt) : null,
      totalMonthlyLiabilities:
        pmDecision?.liabilityForDisplay != null
          ? pmDecision.liabilityForDisplay.toFixed(2)
          : inputs.totalMonthlyLiabilities,
      availableCapacity: availableCapacity ? d2(availableCapacity) : null,
      currentAgeMonths,
      ageAtMaturityMonths,
      employmentTenureMonths:
        pmDecision || employmentStartDate === null
          ? null
          : completeMonthsBetween(employmentStartDate, calculatedAt),
    };

    // ── Policy Snapshot ──────────────────────────────────────────────
    const policySnapshot: BankPolicySnapshot = {
      bankName: policy.bank.name,
      incomeCriterion: policy.bank.incomeCriterion,
      debtCommitmentFactor: d2(debtCommitmentFactor),
      minimumEmploymentTenureMonths: policy.minimumEmploymentTenureMonths,
      minimumApplicantAgeMonths: policy.minimumApplicantAgeMonths,
      maximumApplicationAgeMonths: policy.maximumApplicationAgeMonths,
      minimumIncome: policy.minimumIncome ? policy.minimumIncome.toString() : null,
      minimumPropertyValue: policy.minimumPropertyValue ? policy.minimumPropertyValue.toString() : null,
      minimumBureauScore: policy.bank.minimumBureauScore ?? null,
    };

    const pfaeFactor = isPfae
      ? this.resolvePfaeFactor(policy.bank, pfae.source, pfae.satDescription)
      : null;

    return {
      bankCode: policy.bank.code,
      productCode: policy.code,
      status,
      reasons,
      policySnapshot,
      calculation,
      checks,
      appliedFactor: pmDecision
        ? pmDecision.appliedFactor
        : pfaeFactor?.factor != null
          ? d2(pfaeFactor.factor)
          : null,
      factorMode: pmDecision ? pmDecision.factorMode : (pfaeFactor?.factorMode ?? null),
      matchedNativeLabel: pmDecision
        ? pmDecision.matchedNativeLabel
        : (pfaeFactor?.matchedNativeLabel ?? null),
      satDescription: isPfae
        ? pfae.satDescription
        : (pmDecision ? (pm?.bases?.activity.description ?? null) : null),
      taxReturnPolicy: isPfae ? (policy.bank.taxReturnPolicy as TaxReturnPolicy) : null,
      ...(scopedExclusion.kind === 'excluded'
        ? { matchedExclusionLabel: scopedExclusion.label }
        : {}),
    };
  }

  // ── Status Precedence ──────────────────────────────────────────────

  private resolveProductStatus(
    checks: Record<string, CheckResult>,
    reasons: string[],
    incomeMissing: boolean,
    birthDateMissing: boolean,
  ): ProductMatchStatus {
    // NOT_COMPATIBLE: non-correctable fails
    const hasNotCompatible =
      reasons.includes('NEGATIVE_CAPACITY') ||
      reasons.includes('MINIMUM_AGE_NOT_MET') ||
      reasons.includes('MAXIMUM_APPLICATION_AGE_EXCEEDED') ||
      reasons.includes('INSUFFICIENT_EMPLOYMENT_TENURE') ||
      reasons.includes('INCOME_BELOW_MINIMUM') ||
      reasons.includes('PROPERTY_VALUE_BELOW_MINIMUM') ||
      reasons.some((r) => r.endsWith('_SCORE_BELOW_THRESHOLD')) ||
      reasons.includes('SANTANDER_MOP_KNOCKOUT') ||
      reasons.includes('TAX_RETURN_REJECTED') ||
      reasons.includes('INSUFFICIENT_ACTIVITY_TENURE') ||
      reasons.includes('HSBC_LIQUIDITY_ACTIVITY_RESTRICTED') ||
      checks.capacity.status === 'FAIL';

    if (hasNotCompatible) return 'NOT_COMPATIBLE';

    // REQUIRES_REVIEW: data missing
    const hasRequiresReview =
      incomeMissing ||
      birthDateMissing ||
      reasons.includes('UNCONFIRMED_INCOME') ||
      reasons.includes('SCOTIABANK_PAGADORA_EXCLUSION') ||
      reasons.includes('CONFLICTING_EMPLOYMENT_DATES') ||
      reasons.includes('ACTIVITY_UNMAPPED') ||
      reasons.includes('MISSING_ACTIVITY_START_DATE') ||
      Object.values(checks).some((c) => c.status === 'REQUIRES_REVIEW');

    if (hasRequiresReview) return 'REQUIRES_REVIEW';

    if (reasons.includes('TAX_RETURN_NOT_PREFERRED')) return 'CONDITIONED';

    return 'PRELIMINARY_VIABLE';
  }

  // ── Aggregate Outcome ──────────────────────────────────────────────

  private computeAggregateOutcome(
    bankResults: BankResult[],
    destination: string | null,
  ): AnalysisOutcome {
    if (!destination) return 'PARTIAL';
    if (bankResults.length === 0) return 'PARTIAL';

    const hasViable = bankResults.some((m) => m.status === 'PRELIMINARY_VIABLE');
    if (hasViable) return 'PASS';

    const hasConditionedOrReview = bankResults.some(
      (m) => m.status === 'CONDITIONED' || m.status === 'REQUIRES_REVIEW',
    );
    if (hasConditionedOrReview) return 'PARTIAL';

    return 'FAIL';
  }
}
