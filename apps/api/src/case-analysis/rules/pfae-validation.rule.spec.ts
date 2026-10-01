import { PfaeValidationRule } from './pfae-validation.rule';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaDocumentLike } from './identity-match.rule';
import type { PfaeValidationSnapshot } from '../types/pfae-validation.types';

describe('PfaeValidationRule', () => {
  let rule: PfaeValidationRule;

  function emptyPrisma(): PrismaService {
    return {
      bank: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
  }

  beforeEach(() => {
    rule = new PfaeValidationRule(emptyPrisma());
  });

  it('has ruleId "pfae-validation"', () => {
    expect(rule.ruleId).toBe('pfae-validation');
  });

  /** Helper: build a document-like object matching the Prisma Document shape. */
  const doc = (
    typeCode: string,
    extractedData: Record<string, unknown> | null,
  ): PrismaDocumentLike => ({
    documentType: { code: typeCode },
    extractedData,
  });

  const pfaeClient = (over: Record<string, unknown> = {}) => ({
    personType: 'PFAE',
    ...over,
  });

  const snapshot = (result: { detail: { pfaeValidation?: unknown } }): PfaeValidationSnapshot =>
    result.detail.pfaeValidation as PfaeValidationSnapshot;

  const independentCsf = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    isSolelySalaried: false,
    tenureMonths: 36,
    activityStartDate: '2023-01-15',
    issuance: { issuanceDate: '2026-08-01', isOlderThan3Months: false },
    activities: [
      {
        description: 'Servicios profesionales',
        percentage: 100,
        startDate: '2023-01-15',
        endDate: null,
      },
    ],
    alerts: [],
    ...over,
  });

  describe('defensive non-PFAE no-op', () => {
    it('returns PASS with empty snapshot when personType is SALARIED', async () => {
      const docs = [doc('CSF', independentCsf({ isSolelySalaried: true }))];
      const result = await rule.execute({ personType: 'SALARIED' }, docs);

      expect(result.ruleId).toBe('pfae-validation');
      expect(result.outcome).toBe('PASS');
      expect(result.severity).toBe('INFO');
      expect(result.detail.fields).toEqual([]);
      expect(result.alerts).toHaveLength(0);
      const snap = snapshot(result);
      expect(snap.regime).toEqual({ isSolelySalaried: false, outcome: 'PASS' });
      expect(snap.vigencia).toBeNull();
      expect(snap.tenure).toBeNull();
      expect(snap.activity).toBeNull();
      expect(snap.coherence).toBeNull();
    });
  });

  describe('solely salaried', () => {
    it('returns FAIL with ERROR alert when isSolelySalaried is true', async () => {
      const docs = [doc('CSF', independentCsf({ isSolelySalaried: true }))];
      const result = await rule.execute(pfaeClient(), docs);

      expect(result.outcome).toBe('FAIL');
      expect(result.severity).toBe('ERROR');
      expect(result.detail.fields).toEqual([]);
      expect(snapshot(result).regime).toEqual({ isSolelySalaried: true, outcome: 'FAIL' });
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleCode: 'REGIMEN_EXCLUSIVAMENTE_ASALARIADO',
            severity: 'ERROR',
            field: 'regime',
          }),
        ]),
      );
    });

    it('does not copy a solely-salaried document alert when the field is false', async () => {
      const docs = [
        doc(
          'CSF',
          independentCsf({
            isSolelySalaried: false,
            alerts: [
              {
                code: 'REGIMEN_EXCLUSIVAMENTE_ASALARIADO',
                severity: 'ERROR',
                message: 'copied from extraction',
              },
            ],
          }),
        ),
      ];
      const result = await rule.execute(pfaeClient(), docs);

      expect(result.outcome).toBe('PASS');
      expect(snapshot(result).regime.outcome).toBe('PASS');
      expect(result.alerts.map((a) => a.ruleCode)).not.toContain(
        'REGIMEN_EXCLUSIVAMENTE_ASALARIADO',
      );
    });
  });

  describe('missing CSF', () => {
    it('returns PARTIAL with empty snapshot when there is no CSF document', async () => {
      const result = await rule.execute(pfaeClient(), []);

      expect(result.outcome).toBe('PARTIAL');
      expect(result.severity).toBe('WARNING');
      expect(result.detail.fields).toEqual([]);
      const snap = snapshot(result);
      expect(snap.regime).toEqual({ isSolelySalaried: false, outcome: 'PASS' });
      expect(snap.vigencia).toBeNull();
      expect(snap.tenure).toBeNull();
      expect(snap.activity).toBeNull();
      expect(snap.coherence).toBeNull();
      expect(result.alerts.map((a) => a.ruleCode)).not.toContain(
        'REGIMEN_EXCLUSIVAMENTE_ASALARIADO',
      );
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleCode: 'PFAE_CSF_MISSING',
            severity: 'WARNING',
          }),
        ]),
      );
    });

    it('returns PARTIAL when CSF extractedData is null', async () => {
      const result = await rule.execute(pfaeClient(), [doc('CSF', null)]);

      expect(result.outcome).toBe('PARTIAL');
      expect(snapshot(result).regime.outcome).toBe('PASS');
      expect(result.alerts.some((a) => a.ruleCode === 'PFAE_CSF_MISSING')).toBe(true);
    });
  });

  describe('vigencia', () => {
    it('returns PARTIAL with WARNING when issuance is older than 3 months, not FAIL', async () => {
      const docs = [
        doc(
          'CSF',
          independentCsf({
            issuance: { issuanceDate: '2025-01-01', isOlderThan3Months: true },
          }),
        ),
      ];
      const result = await rule.execute(pfaeClient(), docs);

      expect(result.outcome).toBe('PARTIAL');
      expect(result.severity).toBe('WARNING');
      expect(result.outcome).not.toBe('FAIL');
      expect(snapshot(result).vigencia).toEqual({
        issuanceDate: '2025-01-01',
        isOlderThan3Months: true,
        outcome: 'WARNING',
      });
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleCode: 'VIGENCIA_MAYOR_3_MESES',
            severity: 'WARNING',
          }),
        ]),
      );
    });
  });

  describe('tenure', () => {
    it('emits INFO only for 12-month tenure and ignores ARRAIGO_INSUFICIENTE', async () => {
      const docs = [
        doc(
          'CSF',
          independentCsf({
            tenureMonths: 12,
            activityStartDate: '2025-09-01',
            alerts: [
              {
                code: 'ARRAIGO_INSUFICIENTE',
                severity: 'WARNING',
                message: 'Antigüedad de 12 meses',
              },
            ],
          }),
        ),
      ];
      const result = await rule.execute(pfaeClient(), docs);

      expect(result.outcome).toBe('PASS');
      expect(result.outcome).not.toBe('FAIL');
      expect(snapshot(result).tenure).toEqual({
        months: 12,
        activityStartDate: '2025-09-01',
      });
      expect(result.alerts.map((a) => a.ruleCode)).not.toContain('ARRAIGO_INSUFICIENTE');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleCode: 'PFAE_ACTIVITY_TENURE',
            severity: 'INFO',
            message: 'Antigüedad en la actividad independiente: 1 año.',
          }),
        ]),
      );
    });
  });

  describe('coherence', () => {
    it('returns PARTIAL WARNING when cleaned deposits have RENT_WITHOUT_CSF_REGIME', async () => {
      const docs = [
        doc('CSF', independentCsf()),
        doc('BANK_STATEMENT', {
          financialDepuration: {
            cleanedDeposits: [
              { trashCategory: 'OWN_TRANSFER' },
              { trashCategory: 'RENT_WITHOUT_CSF_REGIME' },
              { trashCategory: 'RENT_WITHOUT_CSF_REGIME' },
            ],
          },
        }),
      ];
      const result = await rule.execute(pfaeClient(), docs);

      expect(result.outcome).toBe('PARTIAL');
      expect(result.severity).toBe('WARNING');
      expect(snapshot(result).coherence).toEqual({
        rentWithoutRegimeCount: 2,
        outcome: 'WARNING',
      });
      expect(result.detail.sources).toEqual(expect.arrayContaining(['csf', 'bank-statement']));
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleCode: 'RENT_WITHOUT_CSF_REGIME',
            severity: 'WARNING',
          }),
        ]),
      );
    });

    it('omits coherence when there are no bank statements', async () => {
      const result = await rule.execute(pfaeClient(), [doc('CSF', independentCsf())]);

      expect(snapshot(result).coherence).toBeNull();
      expect(result.alerts.map((a) => a.ruleCode)).not.toContain('RENT_WITHOUT_CSF_REGIME');
      expect(result.detail.sources).toEqual(['csf']);
    });

    it('omits coherence when bank statements have no cleanedDeposits array', async () => {
      const docs = [
        doc('CSF', independentCsf()),
        doc('BANK_STATEMENT', { accountHolder: { fullName: 'JOSE PEREZ' } }),
      ];
      const result = await rule.execute(pfaeClient(), docs);

      expect(snapshot(result).coherence).toBeNull();
      expect(result.alerts.map((a) => a.ruleCode)).not.toContain('RENT_WITHOUT_CSF_REGIME');
    });

    it('omits coherence when cleanedDeposits is an empty array', async () => {
      const docs = [
        doc('CSF', independentCsf()),
        doc('BANK_STATEMENT', { financialDepuration: { cleanedDeposits: [] } }),
      ];
      const result = await rule.execute(pfaeClient(), docs);

      expect(snapshot(result).coherence).toBeNull();
      expect(result.outcome).toBe('PASS');
    });

    it('records PASS coherence when deposits exist but none are rent without régimen', async () => {
      const docs = [
        doc('CSF', independentCsf()),
        doc('BANK_STATEMENT', {
          financialDepuration: {
            cleanedDeposits: [{ trashCategory: 'OWN_TRANSFER' }, { validCategory: 'COMMERCIAL_SPEI' }],
          },
        }),
      ];
      const result = await rule.execute(pfaeClient(), docs);

      expect(snapshot(result).coherence).toEqual({
        rentWithoutRegimeCount: 0,
        outcome: 'PASS',
      });
      expect(result.outcome).toBe('PASS');
      expect(result.alerts.map((a) => a.ruleCode)).not.toContain('RENT_WITHOUT_CSF_REGIME');
    });
  });

  describe('tax-loss alerts ignored', () => {
    it('does not copy tax-return PERDIDA_FISCAL_KNOCKOUT_DECLARACION into Phase A', async () => {
      const docs = [
        doc('CSF', independentCsf()),
        doc('TAX_RETURN', {
          hasTaxLoss: true,
          alerts: [
            {
              code: 'PERDIDA_FISCAL_KNOCKOUT_DECLARACION',
              severity: 'ERROR',
              message: 'Pérdida fiscal',
            },
          ],
        }),
      ];
      const result = await rule.execute(pfaeClient(), docs);

      expect(result.outcome).toBe('PASS');
      expect(result.alerts.map((a) => a.ruleCode)).not.toContain(
        'PERDIDA_FISCAL_KNOCKOUT_DECLARACION',
      );
    });
  });

  describe('ACTIVITY_UNMAPPED (MATRIX giro)', () => {
    function makePrisma(banks: Record<string, unknown>[]) {
      return {
        bank: { findMany: jest.fn().mockResolvedValue(banks) },
      } as unknown as PrismaService;
    }

    function matrixBank(overrides: Record<string, unknown> = {}) {
      return {
        id: 'bank-mifel',
        code: 'MIFEL',
        name: 'Mifel',
        pfaeFactorMode: 'MATRIX',
        activityFactors: [
          {
            nativeLabel: 'Comercio',
            satAliases: ['comercio', 'hoteles'],
            factor: 0.35,
            factorTaxReturn: null,
          },
        ],
        ...overrides,
      };
    }

    it('returns PARTIAL WARNING ACTIVITY_UNMAPPED when any MATRIX bank misses the CSF alias', async () => {
      const prisma = makePrisma([matrixBank()]);
      const unmappedRule = new PfaeValidationRule(prisma);
      const docs = [
        doc(
          'CSF',
          independentCsf({
            activities: [
              {
                description: 'Consultorios de medicina especializada',
                percentage: 100,
                endDate: null,
              },
            ],
          }),
        ),
      ];

      const result = await unmappedRule.execute(pfaeClient(), docs);

      expect(result.outcome).toBe('PARTIAL');
      expect(result.severity).toBe('WARNING');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleCode: 'ACTIVITY_UNMAPPED',
            severity: 'WARNING',
            field: 'activity',
            message:
              'Ningún banco con matriz de giros tiene un factor para esta actividad SAT (Mifel). Esos bancos quedan en revisión.',
          }),
        ]),
      );
      expect(snapshot(result).activity?.unmappedBanks).toEqual(['Mifel']);
      expect(snapshot(result).activity?.matchedBanks).toEqual([]);
    });

    it('lists banks that matched and banks that missed in the warning', async () => {
      const prisma = makePrisma([
        matrixBank({
          activityFactors: [
            {
              nativeLabel: 'Establecimientos y PI de salud',
              satAliases: ['consultorios', 'medicos'],
              factor: 1.5,
              factorTaxReturn: null,
            },
          ],
        }),
        {
          id: 'bank-afirme',
          code: 'AFIRME',
          name: 'Afirme',
          pfaeFactorMode: 'MATRIX',
          activityFactors: [
            {
              nativeLabel: 'Honorarios',
              satAliases: ['honorarios'],
              factor: 1.0,
              factorTaxReturn: null,
            },
          ],
        },
      ]);
      const mixedRule = new PfaeValidationRule(prisma);
      const docs = [
        doc(
          'CSF',
          independentCsf({
            activities: [
              {
                description:
                  'Consultorios de medicina especializada pertenecientes al sector privado',
                percentage: 100,
                endDate: null,
              },
            ],
          }),
        ),
      ];

      const result = await mixedRule.execute(pfaeClient(), docs);

      expect(result.outcome).toBe('PARTIAL');
      const alert = result.alerts.find((a) => a.ruleCode === 'ACTIVITY_UNMAPPED');
      expect(alert?.message).toBe(
        'Esta actividad SAT sí tiene giro en Mifel. No hay factor de giro en Afirme; esos bancos quedan en revisión.',
      );
      expect(snapshot(result).activity).toEqual(
        expect.objectContaining({
          matchedBanks: ['Mifel'],
          unmappedBanks: ['Afirme'],
        }),
      );
    });

    it('does not emit ACTIVITY_UNMAPPED when the CSF alias hits every MATRIX bank', async () => {
      const prisma = makePrisma([
        matrixBank({
          activityFactors: [
            {
              nativeLabel: 'Comercio',
              satAliases: ['comercio'],
              factor: 0.35,
              factorTaxReturn: null,
            },
          ],
        }),
      ]);
      const mappedRule = new PfaeValidationRule(prisma);
      const docs = [
        doc(
          'CSF',
          independentCsf({
            activities: [
              { description: 'Comercio al por menor', percentage: 100, endDate: null },
            ],
          }),
        ),
      ];

      const result = await mappedRule.execute(pfaeClient(), docs);

      expect(result.alerts.map((a) => a.ruleCode)).not.toContain('ACTIVITY_UNMAPPED');
      expect(result.outcome).toBe('PASS');
    });

    it('skips FLAT and NONE banks so a missing alias does not warn', async () => {
      const prisma = makePrisma([
        {
          id: 'bank-banorte',
          code: 'BANORTE',
          pfaeFactorMode: 'FLAT',
          activityFactors: [],
        },
        {
          id: 'bank-hsbc',
          code: 'HSBC',
          pfaeFactorMode: 'NONE',
          activityFactors: [],
        },
      ]);
      const skipRule = new PfaeValidationRule(prisma);
      const docs = [
        doc(
          'CSF',
          independentCsf({
            activities: [
              { description: 'Consultorios de medicina especializada', percentage: 100, endDate: null },
            ],
          }),
        ),
      ];

      const result = await skipRule.execute(pfaeClient(), docs);

      expect(result.alerts.map((a) => a.ruleCode)).not.toContain('ACTIVITY_UNMAPPED');
      expect(result.outcome).toBe('PASS');
    });

    it('warns when ANY MATRIX bank misses even if another MATRIX bank hits', async () => {
      const prisma = makePrisma([
        matrixBank({
          id: 'bank-mifel',
          code: 'MIFEL',
          activityFactors: [
            { nativeLabel: 'Comercio', satAliases: ['comercio'], factor: 0.35, factorTaxReturn: null },
          ],
        }),
        matrixBank({
          id: 'bank-santander',
          code: 'SANTANDER',
          activityFactors: [
            {
              nativeLabel: 'PI',
              satAliases: ['profesionista independiente'],
              factor: 0.8,
              factorTaxReturn: null,
            },
          ],
        }),
      ]);
      const mixedRule = new PfaeValidationRule(prisma);
      const docs = [
        doc(
          'CSF',
          independentCsf({
            activities: [
              { description: 'Comercio al por menor', percentage: 100, endDate: null },
            ],
          }),
        ),
      ];

      const result = await mixedRule.execute(pfaeClient(), docs);

      expect(result.outcome).toBe('PARTIAL');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleCode: 'ACTIVITY_UNMAPPED', severity: 'WARNING' }),
        ]),
      );
    });
  });

  describe('ACTIVITY_NOT_SUSCEPTIBLE (global exclusion)', () => {
    const csfWith = (activities: Record<string, unknown>[]) =>
      doc('CSF', independentCsf({ activities }));

    it('returns FAIL with an ERROR alert on activity that names the matched label', async () => {
      const result = await rule.execute(pfaeClient(), [
        csfWith([{ description: 'Partidos políticos', percentage: 100, endDate: null }]),
      ]);

      expect(result.outcome).toBe('FAIL');
      expect(result.severity).toBe('ERROR');
      const alert = result.alerts.find((a) => a.ruleCode === 'ACTIVITY_NOT_SUSCEPTIBLE');
      expect(alert).toEqual(
        expect.objectContaining({ severity: 'ERROR', field: 'activity' }),
      );
      expect(alert?.message).toContain('Partidos políticos');
      expect(snapshot(result).activity?.nonSusceptible).toBe('Partidos políticos');
    });

    it('compares the primary independent activity, skipping a larger salaried row', async () => {
      const result = await rule.execute(pfaeClient(), [
        csfWith([
          { description: 'Sueldos y salarios', percentage: 60, endDate: null },
          { description: 'Minería de carbón', percentage: 40, endDate: null },
        ]),
      ]);

      expect(result.outcome).toBe('FAIL');
      expect(result.alerts.map((a) => a.ruleCode)).toContain('ACTIVITY_NOT_SUSCEPTIBLE');
      expect(snapshot(result).activity?.nonSusceptible).toBe('Minería');
    });

    it('stays silent for an HSBC-only construction subsector', async () => {
      const result = await rule.execute(pfaeClient(), [
        csfWith([
          {
            description: 'Construcción de inmuebles comerciales, institucionales y de servicios',
            percentage: 100,
            endDate: null,
          },
        ]),
      ]);

      expect(result.outcome).toBe('PASS');
      expect(result.alerts.map((a) => a.ruleCode)).not.toContain('ACTIVITY_NOT_SUSCEPTIBLE');
      expect(snapshot(result).activity?.nonSusceptible).toBeUndefined();
    });

    it('emits no alert for an eligible activity', async () => {
      const result = await rule.execute(pfaeClient(), [
        csfWith([{ description: 'Servicios de arquitectura', percentage: 100, endDate: null }]),
      ]);

      expect(result.alerts.map((a) => a.ruleCode)).not.toContain('ACTIVITY_NOT_SUSCEPTIBLE');
      expect(result.outcome).toBe('PASS');
    });
  });

  describe('detail contract', () => {
    it('keeps detail.fields empty on a completed run with gate outcomes', async () => {
      const docs = [
        doc(
          'CSF',
          independentCsf({
            isSolelySalaried: true,
            issuance: { issuanceDate: '2025-01-01', isOlderThan3Months: true },
          }),
        ),
      ];
      const result = await rule.execute(pfaeClient(), docs);

      expect(result.detail.fields).toEqual([]);
      expect(result.detail.pfaeValidation).toBeDefined();
    });

    it('persists SAT activity text from the highest active percentage', async () => {
      const docs = [
        doc(
          'CSF',
          independentCsf({
            activities: [
              { description: 'Arrendamiento', percentage: 30, endDate: null },
              { description: 'Comercio al por menor', percentage: 70, endDate: null },
              { description: 'Cerrada', percentage: 90, endDate: '2020-01-01' },
            ],
          }),
        ),
      ];
      const result = await rule.execute(pfaeClient(), docs);

      expect(snapshot(result).activity).toEqual({
        satDescription: 'Comercio al por menor',
        percentage: 70,
        matchedBanks: [],
        unmappedBanks: [],
      });
    });
  });
});
