import { Test, TestingModule } from '@nestjs/testing';
import {
  BankStatementCleanerService,
  RawTransaction,
  StatementSummary,
  ClientFiscalContext,
} from './bank-statement-cleaner.service';

describe('BankStatementCleanerService', () => {
  let service: BankStatementCleanerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BankStatementCleanerService],
    }).compile();

    service = module.get<BankStatementCleanerService>(
      BankStatementCleanerService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Rule Zero: Own Transfers
  // ─────────────────────────────────────────────────────────────────────────
  describe('Rule Zero: Own Transfers Detection', () => {
    const clientContext: ClientFiscalContext = {
      clientRfc: 'PEAJ800101XYZ',
      clientFullName: 'Juan Carlos Pérez Álvarez',
    };

    it('should discard transfer with generic own transfer concept', () => {
      const tx: RawTransaction = {
        date: '2026-05-10',
        amount: 25000,
        originalConcept: 'TRASPASO ENTRE CUENTAS PROPIAS',
        movementType: 'DEPOSIT',
      };

      const result = service.clean([tx], {}, clientContext);
      expect(result.cleanedDeposits[0].classification).toBe('TRASH');
      expect(result.cleanedDeposits[0].trashCategory).toBe('OWN_TRANSFER');
      expect(result.depurationSummary.totalTrashDeposits).toBe(25000);
      expect(result.depurationSummary.totalValidIncome).toBe(0);
    });

    it('should discard transfer matching client RFC in concept or payerRfc', () => {
      const tx: RawTransaction = {
        date: '2026-05-12',
        amount: 30000,
        originalConcept: 'SPEI RECIBIDO BNET',
        payerRfc: 'PEAJ800101XYZ',
        movementType: 'DEPOSIT',
      };

      const result = service.clean([tx], {}, clientContext);
      expect(result.cleanedDeposits[0].classification).toBe('TRASH');
      expect(result.cleanedDeposits[0].trashCategory).toBe('OWN_TRANSFER');
    });

    it('should discard transfer matching normalized client name', () => {
      const tx: RawTransaction = {
        date: '2026-05-15',
        amount: 18000,
        originalConcept: 'TRANSFERENCIA SPEI',
        payerOrBeneficiaryName: 'JUAN CARLOS PEREZ ALVAREZ',
        movementType: 'DEPOSIT',
      };

      const result = service.clean([tx], {}, clientContext);
      expect(result.cleanedDeposits[0].classification).toBe('TRASH');
      expect(result.cleanedDeposits[0].trashCategory).toBe('OWN_TRANSFER');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Blacklist / Trash Keywords
  // ─────────────────────────────────────────────────────────────────────────
  describe('Blacklist: Financial Trash Detection', () => {
    it('should discard credit / loan disbursements', () => {
      const txs: RawTransaction[] = [
        {
          date: '2026-05-02',
          amount: 50000,
          originalConcept: 'DISPOSICION DE CREDITO PERSONAL',
        },
        {
          date: '2026-05-04',
          amount: 15000,
          originalConcept: 'ABONO PRESTAMO KUESKI PAY',
        },
        {
          date: '2026-05-06',
          amount: 20000,
          originalConcept: 'DISP TDC BANCOMER',
        },
      ];

      const result = service.clean(txs);
      expect(result.depurationSummary.trashDepositsCount).toBe(3);
      expect(result.depurationSummary.totalTrashDeposits).toBe(85000);
      result.cleanedDeposits.forEach((cd) => {
        expect(cd.classification).toBe('TRASH');
        expect(cd.trashCategory).toBe('LOAN_OR_CREDIT');
      });
    });

    it('should discard investment withdrawals and yields', () => {
      const tx: RawTransaction = {
        date: '2026-05-18',
        amount: 100000,
        originalConcept: 'LIQUIDACION PAGARE BANCARIO 28 DIAS',
      };

      const result = service.clean([tx]);
      expect(result.cleanedDeposits[0].classification).toBe('TRASH');
      expect(result.cleanedDeposits[0].trashCategory).toBe('INVESTMENT_WITHDRAWAL');
    });

    it('should discard tax refunds and chargebacks', () => {
      const tx: RawTransaction = {
        date: '2026-05-20',
        amount: 12450,
        originalConcept: 'DEVOLUCION SAT SALDO A FAVOR EJERCICIO 2025',
      };

      const result = service.clean([tx]);
      expect(result.cleanedDeposits[0].classification).toBe('TRASH');
      expect(result.cleanedDeposits[0].trashCategory).toBe('REFUND_OR_REVERSAL');
    });

    it('should discard informal and family transfers', () => {
      const tx: RawTransaction = {
        date: '2026-05-22',
        amount: 1500,
        originalConcept: 'PAGO CHELAS Y COMIDA AMIGOS',
      };

      const result = service.clean([tx]);
      expect(result.cleanedDeposits[0].classification).toBe('TRASH');
      expect(result.cleanedDeposits[0].trashCategory).toBe('INFORMAL_FAMILY');
    });

    it('should discard down payment savings', () => {
      const tx: RawTransaction = {
        date: '2026-05-25',
        amount: 75000,
        originalConcept: 'APARTADO CASA FRACCIONAMIENTO',
      };

      const result = service.clean([tx]);
      expect(result.cleanedDeposits[0].classification).toBe('TRASH');
      expect(result.cleanedDeposits[0].trashCategory).toBe('DOWN_PAYMENT_SAVING');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Rental Income conditional on CSF Regime 606
  // ─────────────────────────────────────────────────────────────────────────
  describe('Rental Income Validation with CSF', () => {
    const tx: RawTransaction = {
      date: '2026-05-05',
      amount: 18000,
      originalConcept: 'PAGO RENTA DEPTO 4B MAYO',
    };

    it('should accept rental income when client has Regime 606 in CSF', () => {
      const clientContext: ClientFiscalContext = {
        regimes: [
          {
            code: '606',
            description: 'Régimen de Arrendamiento',
          },
        ],
      };

      const result = service.clean([tx], {}, clientContext);
      expect(result.cleanedDeposits[0].classification).toBe('VALID');
      expect(result.cleanedDeposits[0].validCategory).toBe('RENTAL_WITH_REGIME');
      expect(result.depurationSummary.totalValidIncome).toBe(18000);
    });

    it('should discard rental income when client does NOT have Regime 606 in CSF', () => {
      const clientContext: ClientFiscalContext = {
        regimes: [
          {
            code: '612',
            description: 'Personas Físicas con Actividades Empresariales y Profesionales',
          },
        ],
      };

      const result = service.clean([tx], {}, clientContext);
      expect(result.cleanedDeposits[0].classification).toBe('TRASH');
      expect(result.cleanedDeposits[0].trashCategory).toBe('RENT_WITHOUT_CSF_REGIME');
      expect(result.depurationSummary.totalTrashDeposits).toBe(18000);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Whitelist: TPV, Aggregators & Commercial SPEI
  // ─────────────────────────────────────────────────────────────────────────
  describe('Whitelist: Commercial and POS Liquidations', () => {
    it('should validate POS / TPV settlements (Clip, MercadoPago, Stripe, etc.)', () => {
      const txs: RawTransaction[] = [
        {
          date: '2026-05-01',
          amount: 8450.5,
          originalConcept: 'LIQ TPV CLIP MX',
        },
        {
          date: '2026-05-02',
          amount: 14200,
          originalConcept: 'MERCADOPAGO TRANSFERENCIA VENTAS',
        },
        {
          date: '2026-05-03',
          amount: 5300,
          originalConcept: 'STRIPE PAYMENTS MEXICO',
        },
      ];

      const result = service.clean(txs);
      expect(result.depurationSummary.validDepositsCount).toBe(3);
      expect(result.depurationSummary.totalValidIncome).toBe(27950.5);
      result.cleanedDeposits.forEach((cd) => {
        expect(cd.classification).toBe('VALID');
        expect(cd.validCategory).toBe('TPV_LIQUIDATION');
      });
    });

    it('should validate commercial invoice and professional fees SPEI', () => {
      const tx: RawTransaction = {
        date: '2026-05-08',
        amount: 22000,
        originalConcept: 'PAGO DE HONORARIOS PROFESIONALES FACTURA 104',
      };

      const result = service.clean([tx]);
      expect(result.cleanedDeposits[0].classification).toBe('VALID');
      expect(result.cleanedDeposits[0].validCategory).toBe('COMMERCIAL_SPEI');
    });

    it('should validate recurrent cash deposits', () => {
      const tx: RawTransaction = {
        date: '2026-05-11',
        amount: 6000,
        originalConcept: 'DEP EN PRACTICAJA SUCURSAL 1024',
      };

      const result = service.clean([tx]);
      expect(result.cleanedDeposits[0].classification).toBe('VALID');
      expect(result.cleanedDeposits[0].validCategory).toBe('RECURRENT_CASH');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Sector-Specific Dictionaries (Medical, Health Insurance Payers)
  // ─────────────────────────────────────────────────────────────────────────
  describe('Sector Detection and Specialized Dictionaries', () => {
    it('should detect HEALTH_MEDICAL sector and validate patient consultations & GMM insurance companies', () => {
      const clientContext: ClientFiscalContext = {
        economicActivities: [
          'Consultorios de medicina especializada pertenecientes al sector privado',
        ],
      };

      const txs: RawTransaction[] = [
        {
          date: '2026-05-04',
          amount: 1500,
          originalConcept: 'PAGO CONSULTA MEDICA PACIENTE LOPEZ',
        },
        {
          date: '2026-05-14',
          amount: 45000,
          originalConcept: 'PAGO SINIESTRO HONORARIOS QUIRURGICOS',
          payerOrBeneficiaryName: 'GNP SEGUROS SA',
        },
        {
          date: '2026-05-18',
          amount: 32000,
          originalConcept: 'LIQUIDACION MEDICA CIRUGIA',
          payerOrBeneficiaryName: 'AXA SEGUROS MEXICO',
        },
      ];

      const result = service.clean(txs, {}, clientContext);
      expect(result.depurationSummary.detectedSector).toBe('HEALTH_MEDICAL');
      expect(result.depurationSummary.validDepositsCount).toBe(3);
      expect(result.depurationSummary.totalValidIncome).toBe(78500);
      result.cleanedDeposits.forEach((cd) => {
        expect(cd.classification).toBe('VALID');
        expect(cd.validCategory).toBe('SECTOR_SPECIFIC_INCOME');
      });
    });

    it('should detect FOOD_RESTAURANT and validate catering and delivery apps', () => {
      const clientContext: ClientFiscalContext = {
        economicActivities: [
          'Restaurantes con servicio de preparacion de alimentos a la carta',
        ],
      };

      const tx: RawTransaction = {
        date: '2026-05-15',
        amount: 12500,
        originalConcept: 'LIQUIDACION SEMANAL UBER EATS RESTAURANTE',
      };

      const result = service.clean([tx], {}, clientContext);
      expect(result.depurationSummary.detectedSector).toBe('FOOD_RESTAURANT');
      expect(result.cleanedDeposits[0].classification).toBe('VALID');
      expect(result.cleanedDeposits[0].validCategory).toBe('SECTOR_SPECIFIC_INCOME');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Mathematical Reconciliation Check
  // ─────────────────────────────────────────────────────────────────────────
  describe('Mathematical Reconciliation Check', () => {
    it('should mark MATCHED when transactions sum matches bank cover total exactly', () => {
      const txs: RawTransaction[] = [
        { amount: 50000, originalConcept: 'VENTA 1' },
        { amount: 50000, originalConcept: 'VENTA 2' },
      ];
      const summary: StatementSummary = { totalDepositsAmount: 100000 };

      const result = service.clean(txs, summary);
      expect(result.integrityCheck.status).toBe('MATCHED');
      expect(result.integrityCheck.discrepancy).toBe(0);
    });

    it('should mark MINOR_DIFFERENCE when difference is under $500 or 1%', () => {
      const txs: RawTransaction[] = [
        { amount: 99800, originalConcept: 'VENTA' },
      ];
      const summary: StatementSummary = { totalDepositsAmount: 100000 }; // 200 diff (0.2%)

      const result = service.clean(txs, summary);
      expect(result.integrityCheck.status).toBe('MINOR_DIFFERENCE');
      expect(result.integrityCheck.discrepancy).toBe(200);
    });

    it('should mark CRITICAL_DISCREPANCY when difference exceeds $500 and 1%', () => {
      const txs: RawTransaction[] = [
        { amount: 60000, originalConcept: 'VENTA' },
      ];
      const summary: StatementSummary = { totalDepositsAmount: 100000 }; // 40,000 diff (40%)

      const result = service.clean(txs, summary);
      expect(result.integrityCheck.status).toBe('CRITICAL_DISCREPANCY');
      expect(result.integrityCheck.discrepancy).toBe(40000);
      expect(result.integrityCheck.message).toContain('Discrepancia crítica');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Outlier / High Impact Detection
  // ─────────────────────────────────────────────────────────────────────────
  describe('Outlier and High-Impact Exceptions Detection', () => {
    it('should flag deposit concentrating >= 25% of month total as high impact outlier', () => {
      const txs: RawTransaction[] = [
        { amount: 10000, originalConcept: 'VENTA A' },
        { amount: 10000, originalConcept: 'VENTA B' },
        { amount: 10000, originalConcept: 'VENTA C' },
        { amount: 70000, originalConcept: 'TRANSFERENCIA SPEI' }, // 70% of 100k
      ];

      const result = service.clean(txs);
      expect(result.highImpactExceptions.length).toBe(1);
      expect(result.highImpactExceptions[0].amount).toBe(70000);
      expect(result.highImpactExceptions[0].classification).toBe('NEEDS_REVIEW');
      expect(result.highImpactExceptions[0].isHighImpactOutlier).toBe(true);
    });
  });
});
