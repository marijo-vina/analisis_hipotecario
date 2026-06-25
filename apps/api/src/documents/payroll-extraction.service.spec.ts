import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from './gemini.service';
import {
  PayrollExtractionService,
  PayrollExtractionResult,
} from './payroll-extraction.service';

// ---------------------------------------------------------------------------
// Helpers — mock document builder
// ---------------------------------------------------------------------------

interface MockDocument {
  id: string;
  mortgageCaseId: string;
  documentType: { id: number; code: string; name: string; isActive: boolean };
  documentStatus: { id: number; code: string; name: string; order: number };
  ocrText: string | null;
  extractedData: unknown | null;
}

const makeDocument = (
  overrides: Partial<MockDocument> = {},
): MockDocument => ({
  id: 'doc-payroll-1',
  mortgageCaseId: 'case-1',
  documentType: {
    id: 3,
    code: 'PAYROLL_RECEIPT',
    name: 'Recibo de nómina',
    isActive: true,
  },
  documentStatus: {
    id: 4,
    code: 'PROCESSED',
    name: 'Procesado',
    order: 4,
  },
  ocrText:
    'EMPLEADO: JUAN PÉREZ LÓPEZ\nRFC: PELJ900101ABC\nCURP: PELJ900101HYNRLN08\nEMPLEADOR: CONSTRUCTORA MEXICANA SA\nRFC EMPLEADOR: CME850101XYZ\nPERIODO: 2026-05-15 A 2026-05-30\nFECHA PAGO: 2026-05-31\nPERCEPCIONES: SUELDO 16000.00, AYUDA TRANSPORTE 2000.00\nDEDUCCIONES: ISR 1800.00, IMSS 1400.00\nTOTAL PERCEPCIONES: 18000.00\nTOTAL DEDUCCIONES: 3200.00\nNETO: 14800.00\nUUID: 123e4567-e89b-12d3-a456-426614174000\nSELLO DIGITAL SAT: PRESENTE\nQR: PRESENTE\nFECHA TIMBRADO: 2026-05-30T12:00:00Z\nANTIGÜEDAD: 2 AÑOS 5 MESES\nFECHA INGRESO: 2024-01-15',
  extractedData: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Gemini response builders
// ---------------------------------------------------------------------------

const validPayrollResponse = {
  schemaVersion: '1.0',
  documentType: 'PAYROLL_RECEIPT',
  extractionMetadata: {
    sourceDocumentId: 'doc-payroll-1',
    mortgageCaseId: 'case-1',
    ocrProcessedAt: '2026-06-24T12:00:00Z',
    extractedAt: '2026-06-24T12:01:00Z',
    model: 'gemini-2.5-flash',
    confidence: 0.91,
  },
  documentRequirementContext: {
    incomeBehavior: 'FIXED',
    requiredPayrollReceiptMonths: 3,
    requiredBankStatementMonths: 3,
    detectedDocumentMonths: null,
    isRequirementSatisfied: null,
    requirementNotes: null,
  },
  employee: {
    fullName: 'JUAN PÉREZ LÓPEZ',
    rfc: 'PELJ900101ABC',
    curp: 'PELJ900101HYNRLN08',
    employmentStartDate: '2024-01-15',
    employmentSeniorityText: '2 AÑOS 5 MESES',
    contributesToImss: true,
  },
  employer: {
    legalName: 'CONSTRUCTORA MEXICANA SA',
    rfc: 'CME850101XYZ',
    possiblePayrollProvider: false,
  },
  payrollPeriod: {
    periodStartDate: '2026-05-15',
    periodEndDate: '2026-05-30',
    paymentDate: '2026-05-31',
    periodicity: 'BIWEEKLY',
    isClosedPeriod: true,
  },
  income: {
    grossIncome: 18000.0,
    totalDeductions: 3200.0,
    netIncome: 14800.0,
    currency: 'MXN',
    incomeBehaviorDetected: 'FIXED',
    variablePerceptions: [],
  },
  deductions: [
    {
      type: 'TAX',
      description: 'ISR',
      amount: 1800.0,
      requiresAlert: false,
    },
    {
      type: 'IMSS',
      description: 'IMSS',
      amount: 1400.0,
      requiresAlert: false,
    },
  ],
  fiscalStamp: {
    hasQrCode: true,
    hasSatDigitalSeal: true,
    uuid: '123e4567-e89b-12d3-a456-426614174000',
    stampDate: '2026-05-30T12:00:00Z',
  },
  crossCheckPreparation: {
    expectedBankDepositAmount: 14800.0,
    expectedBankDepositDate: '2026-05-31',
    expectedEmployerName: 'CONSTRUCTORA MEXICANA SA',
    requiresBankStatementMatch: true,
  },
  missingFields: [],
  alerts: [],
};

const missingNetIncomeResponse = {
  ...validPayrollResponse,
  income: {
    grossIncome: 18000.0,
    totalDeductions: null,
    netIncome: null,
    currency: 'MXN',
    incomeBehaviorDetected: 'FIXED',
    variablePerceptions: [],
  },
};

const missingRfcResponse = {
  ...validPayrollResponse,
  employee: {
    fullName: 'JUAN PÉREZ LÓPEZ',
    rfc: null,
    curp: 'PELJ900101HYNRLN08',
    employmentStartDate: '2024-01-15',
    employmentSeniorityText: '2 AÑOS 5 MESES',
    contributesToImss: true,
  },
};

const noFiscalStampResponse = {
  ...validPayrollResponse,
  fiscalStamp: {
    hasQrCode: false,
    hasSatDigitalSeal: false,
    uuid: null,
    stampDate: null,
  },
};

const relevantDeductionResponse = {
  ...validPayrollResponse,
  deductions: [
    { type: 'TAX', description: 'ISR', amount: 1800.0, requiresAlert: false },
    { type: 'IMSS', description: 'IMSS', amount: 1400.0, requiresAlert: false },
    {
      type: 'MORTGAGE_LOAN',
      description: 'CRÉDITO HIPOTECARIO',
      amount: 2500.0,
      requiresAlert: true,
    },
  ],
};

const noSeniorityResponse = {
  ...validPayrollResponse,
  employee: {
    fullName: 'JUAN PÉREZ LÓPEZ',
    rfc: 'PELJ900101ABC',
    curp: 'PELJ900101HYNRLN08',
    employmentStartDate: null,
    employmentSeniorityText: null,
    contributesToImss: false,
  },
};

const variableIncomeResponse = {
  ...validPayrollResponse,
  income: {
    grossIncome: 32000.0,
    totalDeductions: 7000.0,
    netIncome: 25000.0,
    currency: 'MXN',
    incomeBehaviorDetected: 'VARIABLE',
    variablePerceptions: [
      {
        type: 'COMMISSION',
        description: 'COMISIONES POR VENTA',
        amount: 8000.0,
      },
    ],
  },
};

const payrollProviderResponse = {
  ...validPayrollResponse,
  employer: {
    legalName: 'SERVICIOS ADMINISTRATIVOS SA DE CV',
    rfc: 'SAD850101XYZ',
    possiblePayrollProvider: true,
  },
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('PayrollExtractionService', () => {
  let service: PayrollExtractionService;
  let mockPrisma: { document: { findUnique: jest.Mock; update: jest.Mock } };
  let mockGemini: { extractStructuredData: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      document: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    mockGemini = {
      extractStructuredData: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollExtractionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GeminiService, useValue: mockGemini },
      ],
    }).compile();

    service = module.get<PayrollExtractionService>(PayrollExtractionService);
  });

  // ── isPayrollDocument guard ─────────────────────────────────────────
  describe('isPayrollDocument', () => {
    it('returns true for PAYROLL_RECEIPT', () => {
      expect(
        PayrollExtractionService.isPayrollDocument('PAYROLL_RECEIPT'),
      ).toBe(true);
    });

    it('returns false for INE', () => {
      expect(PayrollExtractionService.isPayrollDocument('INE')).toBe(false);
    });

    it('returns false for BANK_STATEMENT', () => {
      expect(
        PayrollExtractionService.isPayrollDocument('BANK_STATEMENT'),
      ).toBe(false);
    });
  });

  // ── Successful extraction ───────────────────────────────────────────
  describe('extract — success path', () => {
    let result: PayrollExtractionResult;

    beforeEach(async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'PAYROLL_RECEIPT',
        extractedData: validPayrollResponse,
      });
      mockPrisma.document.update.mockResolvedValue({});

      result = await service.extract('case-1', 'doc-payroll-1');
    });

    it('returns success', () => {
      expect(result.success).toBe(true);
    });

    it('returns extractedData with employee info', () => {
      const ed = result.extractedData as Record<string, unknown>;
      const employee = ed.employee as Record<string, unknown>;
      expect(employee.fullName).toBe('JUAN PÉREZ LÓPEZ');
      expect(employee.rfc).toBe('PELJ900101ABC');
    });

    it('returns extractedData with income info', () => {
      const ed = result.extractedData as Record<string, unknown>;
      const income = ed.income as Record<string, unknown>;
      expect(income.netIncome).toBe(14800.0);
      expect(income.grossIncome).toBe(18000.0);
    });

    it('persists extractedData to DB', () => {
      expect(mockPrisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'doc-payroll-1' },
          data: expect.objectContaining({ extractedData: expect.any(Object) }),
        }),
      );
    });

    it('calls Gemini with correct OCR text', () => {
      expect(mockGemini.extractStructuredData).toHaveBeenCalledWith(
        expect.stringContaining('EMPLEADO: JUAN PÉREZ'),
        'PAYROLL_RECEIPT',
        expect.any(Object),
        expect.any(String),
      );
    });
  });

  // ── Not PROCESSED ───────────────────────────────────────────────────
  describe('extract — document not processed', () => {
    it('returns error when status is not PROCESSED', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({
          documentStatus: {
            id: 2,
            code: 'UPLOADED',
            name: 'Subido',
            order: 2,
          },
        }),
      );

      const result = await service.extract('case-1', 'doc-payroll-1');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('DOCUMENT_NOT_PROCESSED');
    });
  });

  // ── Empty OCR text ─────────────────────────────────────────────────
  describe('extract — empty OCR text', () => {
    it('returns error when OCR text is empty', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrText: '' }),
      );

      const result = await service.extract('case-1', 'doc-payroll-1');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('OCR_TEXT_EMPTY');
    });
  });

  // ── Gemini failure ─────────────────────────────────────────────────
  describe('extract — Gemini failure', () => {
    it('returns error when Gemini fails', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue({
        success: false,
        documentType: 'PAYROLL_RECEIPT',
        extractedData: null,
        error: { code: 'GEMINI_TIMEOUT', message: 'Timeout' },
      });

      const result = await service.extract('case-1', 'doc-payroll-1');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('GEMINI_TIMEOUT');
    });

    it('returns GEMINI_TEMPORARILY_UNAVAILABLE and does NOT save data', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue({
        success: false,
        documentType: 'PAYROLL_RECEIPT',
        extractedData: null,
        error: {
          code: 'GEMINI_TEMPORARILY_UNAVAILABLE',
          message:
            'Gemini no estuvo disponible temporalmente. Intenta reprocesar el documento en unos minutos.',
        },
      });

      const result = await service.extract('case-1', 'doc-payroll-1');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('GEMINI_TEMPORARILY_UNAVAILABLE');
      expect(result.extractedData).toBeNull();
      // Must NOT attempt to persist
      expect(mockPrisma.document.update).not.toHaveBeenCalled();
    });
  });

  // ── Alert: missing net income ──────────────────────────────────────
  describe('extract — alert: missing net income', () => {
    it('generates CRITICAL alert when netIncome is null', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'PAYROLL_RECEIPT',
        extractedData: missingNetIncomeResponse,
      });
      mockPrisma.document.update.mockResolvedValue({});

      const result = await service.extract('case-1', 'doc-payroll-1');
      expect(result.success).toBe(true);
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'PAYROLL_MISSING_NET_INCOME',
            severity: 'CRITICAL',
            category: 'INCOME',
          }),
        ]),
      );
    });
  });

  // ── Alert: missing employee RFC ────────────────────────────────────
  describe('extract — alert: missing employee RFC', () => {
    it('generates WARNING alert when RFC is null', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'PAYROLL_RECEIPT',
        extractedData: missingRfcResponse,
      });
      mockPrisma.document.update.mockResolvedValue({});

      const result = await service.extract('case-1', 'doc-payroll-1');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'PAYROLL_MISSING_EMPLOYEE_RFC',
            severity: 'WARNING',
          }),
        ]),
      );
    });
  });

  // ── Alert: no fiscal stamp ─────────────────────────────────────────
  describe('extract — alert: no fiscal stamp', () => {
    it('generates WARNING alert when QR and seal are false', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'PAYROLL_RECEIPT',
        extractedData: noFiscalStampResponse,
      });
      mockPrisma.document.update.mockResolvedValue({});

      const result = await service.extract('case-1', 'doc-payroll-1');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'PAYROLL_NO_FISCAL_STAMP',
            severity: 'WARNING',
            category: 'DOCUMENT_QUALITY',
          }),
        ]),
      );
    });
  });

  // ── Alert: relevant deduction ──────────────────────────────────────
  describe('extract — alert: relevant deduction', () => {
    it('generates WARNING for MORTGAGE_LOAN deduction', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'PAYROLL_RECEIPT',
        extractedData: relevantDeductionResponse,
      });
      mockPrisma.document.update.mockResolvedValue({});

      const result = await service.extract('case-1', 'doc-payroll-1');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'PAYROLL_DEDUCTION_MORTGAGE_LOAN',
            severity: 'WARNING',
            category: 'INCOME',
          }),
        ]),
      );
    });
  });

  // ── Alert: no seniority ────────────────────────────────────────────
  describe('extract — alert: no seniority', () => {
    it('generates WARNING when both employmentStartDate and seniorityText are null', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'PAYROLL_RECEIPT',
        extractedData: noSeniorityResponse,
      });
      mockPrisma.document.update.mockResolvedValue({});

      const result = await service.extract('case-1', 'doc-payroll-1');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'PAYROLL_NO_SENIORITY',
            severity: 'WARNING',
            category: 'INCOME',
          }),
        ]),
      );
    });
  });

  // ── Alert: variable income ─────────────────────────────────────────
  describe('extract — alert: variable income', () => {
    it('generates WARNING alert when variable perceptions exist', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'PAYROLL_RECEIPT',
        extractedData: variableIncomeResponse,
      });
      mockPrisma.document.update.mockResolvedValue({});

      const result = await service.extract('case-1', 'doc-payroll-1');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'PAYROLL_VARIABLE_INCOME',
            severity: 'WARNING',
            category: 'INCOME',
          }),
        ]),
      );
    });
  });

  // ── Alert: payroll provider ────────────────────────────────────────
  describe('extract — alert: payroll provider', () => {
    it('generates WARNING when possiblePayrollProvider is true', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'PAYROLL_RECEIPT',
        extractedData: payrollProviderResponse,
      });
      mockPrisma.document.update.mockResolvedValue({});

      const result = await service.extract('case-1', 'doc-payroll-1');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'PAYROLL_POSSIBLE_PROVIDER',
            severity: 'WARNING',
          }),
        ]),
      );
    });
  });

  // ── Missing fields ─────────────────────────────────────────────────
  describe('extract — missing fields', () => {
    it('reports missing employee.fullName when null', async () => {
      const response = {
        ...validPayrollResponse,
        employee: { ...validPayrollResponse.employee, fullName: null },
      };
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'PAYROLL_RECEIPT',
        extractedData: response,
      });
      mockPrisma.document.update.mockResolvedValue({});

      const result = await service.extract('case-1', 'doc-payroll-1');
      expect(result.missingFields).toContain('employee.fullName');
    });
  });

  // ── DB persistence failure (non-blocking) ──────────────────────────
  describe('extract — DB persistence failure', () => {
    it('returns success even when DB update fails', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'PAYROLL_RECEIPT',
        extractedData: validPayrollResponse,
      });
      mockPrisma.document.update.mockRejectedValue(
        new Error('DB connection lost'),
      );

      const result = await service.extract('case-1', 'doc-payroll-1');
      expect(result.success).toBe(true);
      expect(result.extractedData).not.toBeNull();
    });
  });

  // ── IMSS receipt: real data extraction ─────────────────────────────
  describe('extract — IMSS receipt (real data)', () => {
    const imssOcrText =
      'INSTITUTO MEXICANO DEL SEGURO SOCIAL\n' +
      'IMS421231I45\n' +
      'ALEJANDRO DE LA CRUZ DIAZ CABAÑAS\n' +
      'RFC: DICA690402RZ4\n' +
      'CURP: DICA690402HYNZBL09\n' +
      'PERIODO: 1A-MAY-2025\n' +
      'FECHA PAGO: 30-ABR-2025\n' +
      'TOTAL PERCEPCIONES: 39104.26\n' +
      'TOTAL DEDUCCIONES: 12814.26\n' +
      'LIQUIDO: 26290.00\n' +
      'FECHA INGRESO: 20/12/2001\n' +
      'ANTIGÜEDAD: 21 AÑOS 7 QNAS 10 DIAS\n' +
      'FOLIO FISCAL: ACBC5764-82D2-41B9-A6BC-505BAA3CA6ED\n' +
      'FECHA CERTIFICACION: 2025-04-30T09:35:53\n' +
      'CREDITO HIPOTECARIO ESMI: 3972.48\n' +
      'FALTAS INJUSTIFICADAS: 1618.43\n' +
      'ISR: 3506.04\n' +
      'METODO PAGO: ACREDITAMIENTO EN CUENTA\n' +
      'BANCO: BANCOMER\n' +
      'SELLO DIGITAL SAT: PRESENTE\n' +
      'QR: PRESENTE';

    const imssGeminiResponse = {
      schemaVersion: '1.0',
      documentType: 'PAYROLL_RECEIPT',
      extractionMetadata: {
        sourceDocumentId: 'doc-imss-1',
        mortgageCaseId: 'case-1',
        ocrProcessedAt: '2026-06-24T12:00:00Z',
        extractedAt: '2026-06-24T12:01:00Z',
        model: 'gemini-2.5-flash',
        confidence: 0.93,
      },
      documentRequirementContext: {
        incomeBehavior: 'FIXED',
        requiredPayrollReceiptMonths: 3,
        requiredBankStatementMonths: 3,
        detectedDocumentMonths: null,
        isRequirementSatisfied: null,
        requirementNotes: null,
      },
      employee: {
        fullName: 'ALEJANDRO DE LA CRUZ DIAZ CABAÑAS',
        rfc: 'DICA690402RZ4',
        curp: 'DICA690402HYNZBL09',
        employmentStartDate: '2001-12-20',
        employmentSeniorityText: '21 AÑOS 7 QNAS 10 DIAS',
        contributesToImss: null,
      },
      employer: {
        legalName: 'INSTITUTO MEXICANO DEL SEGURO SOCIAL',
        rfc: 'IMS421231I45',
        possiblePayrollProvider: false,
      },
      payrollPeriod: {
        periodStartDate: null,
        periodEndDate: null,
        paymentDate: '2025-04-30',
        periodicity: 'MONTHLY',
        isClosedPeriod: true,
      },
      income: {
        grossIncome: 39104.26,
        totalDeductions: 12814.26,
        netIncome: 26290.0,
        currency: 'MXN',
        incomeBehaviorDetected: 'FIXED',
        variablePerceptions: [],
      },
      deductions: [
        {
          type: 'TAX',
          description: 'ISR',
          amount: 3506.04,
          requiresAlert: false,
        },
        {
          type: 'MORTGAGE_LOAN',
          description: 'CREDITO HIPOTECARIO ESMI',
          amount: 3972.48,
          requiresAlert: true,
        },
        {
          type: 'OTHER',
          description: 'FALTAS INJUSTIFICADAS',
          amount: 1618.43,
          requiresAlert: false,
        },
      ],
      fiscalStamp: {
        hasQrCode: true,
        hasSatDigitalSeal: true,
        hasCfdiStamp: true,
        fiscalFolio: 'ACBC5764-82D2-41B9-A6BC-505BAA3CA6ED',
        certificationDate: '2025-04-30T09:35:53',
      },
      employment: {
        hireDate: '2001-12-20',
        seniorityText: '21 AÑOS 7 QNAS 10 DIAS',
        hasMinimumSeniority: null,
        contributesToImss: null,
        imssEvidence: null,
        imssSignals: [],
      },
      evidence: {},
      crossCheckPreparation: {
        expectedBankDepositAmount: 26290.0,
        expectedBankDepositDate: '2025-04-30',
        expectedEmployerName: 'INSTITUTO MEXICANO DEL SEGURO SOCIAL',
        requiresBankStatementMatch: true,
      },
      missingFields: [],
      alerts: [],
    };

    beforeEach(() => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrText: imssOcrText }),
      );
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'PAYROLL_RECEIPT',
        extractedData: imssGeminiResponse,
      });
      mockPrisma.document.update.mockResolvedValue({});
    });

    it('extracts employer legal name correctly', async () => {
      const result = await service.extract('case-1', 'doc-payroll-1');
      const ed = result.extractedData as Record<string, unknown>;
      const employer = ed.employer as Record<string, unknown>;
      expect(employer.legalName).toBe(
        'INSTITUTO MEXICANO DEL SEGURO SOCIAL',
      );
    });

    it('extracts employer RFC correctly', async () => {
      const result = await service.extract('case-1', 'doc-payroll-1');
      const ed = result.extractedData as Record<string, unknown>;
      const employer = ed.employer as Record<string, unknown>;
      expect(employer.rfc).toBe('IMS421231I45');
    });

    it('extracts employee full name correctly', async () => {
      const result = await service.extract('case-1', 'doc-payroll-1');
      const ed = result.extractedData as Record<string, unknown>;
      const employee = ed.employee as Record<string, unknown>;
      expect(employee.fullName).toBe(
        'ALEJANDRO DE LA CRUZ DIAZ CABAÑAS',
      );
    });

    it('extracts employee RFC correctly', async () => {
      const result = await service.extract('case-1', 'doc-payroll-1');
      const ed = result.extractedData as Record<string, unknown>;
      const employee = ed.employee as Record<string, unknown>;
      expect(employee.rfc).toBe('DICA690402RZ4');
    });

    it('extracts gross income correctly', async () => {
      const result = await service.extract('case-1', 'doc-payroll-1');
      const ed = result.extractedData as Record<string, unknown>;
      const income = ed.income as Record<string, unknown>;
      expect(income.grossIncome).toBe(39104.26);
    });

    it('extracts net income correctly', async () => {
      const result = await service.extract('case-1', 'doc-payroll-1');
      const ed = result.extractedData as Record<string, unknown>;
      const income = ed.income as Record<string, unknown>;
      expect(income.netIncome).toBe(26290.0);
    });

    it('extracts fiscal folio (UUID) correctly', async () => {
      const result = await service.extract('case-1', 'doc-payroll-1');
      const ed = result.extractedData as Record<string, unknown>;
      const fs = ed.fiscalStamp as Record<string, unknown>;
      expect(fs.fiscalFolio).toBe(
        'ACBC5764-82D2-41B9-A6BC-505BAA3CA6ED',
      );
    });

    it('detects timbrado/CFDI as present', async () => {
      const result = await service.extract('case-1', 'doc-payroll-1');
      const ed = result.extractedData as Record<string, unknown>;
      const fs = ed.fiscalStamp as Record<string, unknown>;
      expect(fs.hasQrCode).toBe(true);
      expect(fs.hasSatDigitalSeal).toBe(true);
    });

    it('generates alert for mortgage loan deduction (Crédito Hipotecario ESMI)', async () => {
      const result = await service.extract('case-1', 'doc-payroll-1');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'PAYROLL_DEDUCTION_MORTGAGE_LOAN',
            severity: 'WARNING',
            category: 'INCOME',
          }),
        ]),
      );
    });

    it('does NOT generate false timbrado alert when isStamped is true', async () => {
      const result = await service.extract('case-1', 'doc-payroll-1');
      const timbradoAlerts = result.alerts.filter(
        (a) => a.code === 'PAYROLL_NO_FISCAL_STAMP',
      );
      expect(timbradoAlerts).toHaveLength(0);
    });

    it('infers contributesToImss when employer is IMSS', async () => {
      const result = await service.extract('case-1', 'doc-payroll-1');
      const ed = result.extractedData as Record<string, unknown>;
      const emp = ed.employment as Record<string, unknown>;
      expect(emp.contributesToImss).toBe(true);
    });
  });

  // ── Format flexibility: periodRaw, aliases, contradictions ─────────
  describe('extract — format flexibility', () => {
    const genericOcrText =
      'EMPLEADO: MARIA GONZALEZ HERNANDEZ\n' +
      'RFC: GOHM850101ABC\n' +
      'EMPRESA: COMERCIALIZADORA DEL NORTE SA DE CV\n' +
      'RFC EMPRESA: CNO020101XYZ\n' +
      'FECHA DE PAGO: 15 DE MAYO 2025\n' +
      'PERIODO DE PAGO: 1A-MAY-2025\n' +
      'TOTAL PERCEPCIONES: 25000.00\n' +
      'TOTAL DEDUCCIONES: 5500.00\n' +
      'LIQUIDO: 19500.00\n' +
      'NSS: 12345678901\n' +
      'REGISTRO PATRONAL: Y1234567890\n' +
      'SELLO DIGITAL SAT: PRESENTE';

    const genericGeminiResponse = {
      schemaVersion: '1.0',
      documentType: 'PAYROLL_RECEIPT',
      employee: {
        fullName: 'MARIA GONZALEZ HERNANDEZ',
        rfc: 'GOHM850101ABC',
      },
      employer: {
        legalName: 'COMERCIALIZADORA DEL NORTE SA DE CV',
        rfc: 'CNO020101XYZ',
        possiblePayrollProvider: false,
      },
      payrollPeriod: {
        periodStartDate: null,
        periodEndDate: null,
        paymentDate: '2025-05-15',
        periodRaw: '1A-MAY-2025',
        periodLabel: '1A Quincena Mayo 2025',
        periodicity: 'BIWEEKLY',
      },
      income: {
        grossIncome: 25000,
        totalDeductions: 5500,
        netIncome: 19500,
        currency: 'MXN',
        isVariableIncome: false,
        variablePerceptions: [],
      },
      deductions: [],
      fiscalStamp: {
        hasQrCode: false,
        hasSatDigitalSeal: true,
        hasCfdiStamp: false,
        fiscalFolio: null,
        certificationDate: null,
      },
      employment: {
        hireDate: null,
        seniorityText: null,
        contributesToImss: null,
        imssEvidence: null,
        imssSignals: ['NSS', 'registro patronal'],
      },
      missingFields: [],
      alerts: [],
    };

    beforeEach(() => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrText: genericOcrText }),
      );
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'PAYROLL_RECEIPT',
        extractedData: genericGeminiResponse,
      });
      mockPrisma.document.update.mockResolvedValue({});
    });

    it('accepts periodRaw without explicit start/end dates and does NOT generate period alert', async () => {
      const result = await service.extract('case-1', 'doc-payroll-1');
      const periodAlerts = result.alerts.filter(
        (a) => a.code === 'PAYROLL_MISSING_PERIOD',
      );
      expect(periodAlerts).toHaveLength(0);
    });

    it('does NOT generate false timbrado alert when hasSatDigitalSeal is true', async () => {
      const result = await service.extract('case-1', 'doc-payroll-1');
      const timbradoAlerts = result.alerts.filter(
        (a) => a.code === 'PAYROLL_NO_FISCAL_STAMP',
      );
      expect(timbradoAlerts).toHaveLength(0);
    });

    it('infers contributesToImss from imssSignals (NSS + registro patronal)', async () => {
      const result = await service.extract('case-1', 'doc-payroll-1');
      const ed = result.extractedData as Record<string, unknown>;
      const emp = ed.employment as Record<string, unknown>;
      expect(emp.contributesToImss).toBe(true);
    });

    it('generates seniority alert when no hireDate and no seniorityText', async () => {
      const result = await service.extract('case-1', 'doc-payroll-1');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'PAYROLL_NO_SENIORITY' }),
        ]),
      );
    });
  });
});
