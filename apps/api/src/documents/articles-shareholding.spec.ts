import {
  postProcessArticles,
  resolveVigentShareholding,
  type ArticlesExtractionPayload,
  type CorporateActSnapshot,
} from './articles-shareholding';

const edgardoTable = [
  {
    name: 'EDGARDO GONZÁLEZ HIGUERA',
    series: [
      { label: 'Serie A capital fijo', capitalKind: 'FIXED', shareCount: 25 },
      { label: 'Serie B capital fijo', capitalKind: 'FIXED', shareCount: 1913 },
    ],
    nominalValue: 1000,
    totalValue: 1938000,
    percentage: 51,
    relationshipToApplicant: null,
  },
  {
    name: 'JOSÉ RICARDO BORBOA QUINTERO',
    series: [
      { label: 'Serie A capital fijo', capitalKind: 'FIXED', shareCount: 25 },
      { label: 'Serie B capital fijo', capitalKind: 'FIXED', shareCount: 1837 },
    ],
    nominalValue: 1000,
    totalValue: 1862000,
    percentage: 49,
    relationshipToApplicant: null,
  },
];

function snapshot(
  documentId: string,
  overrides: Partial<ArticlesExtractionPayload>,
): CorporateActSnapshot {
  return {
    documentId,
    payload: {
      documentType: 'ARTICLES_OF_INCORPORATION',
      actKind: 'CONSTITUTIVE',
      legalName: 'MODIEBO',
      legalForm: 'S.A. de C.V.',
      rfc: null,
      deedNumber: null,
      deedDate: null,
      notary: null,
      incorporationDate: '1997-04-28',
      assemblyDate: null,
      shareholders: [],
      applicantShareholderName: null,
      applicantSharePercentage: null,
      administrationType: 'UNKNOWN',
      administration: [],
      powers: [],
      registry: { folio: null, date: null, place: null },
      isNonProfit: false,
      capTableChanged: null,
      alerts: [],
      extractionTimestamp: '2026-10-09T00:00:00.000Z',
      ...overrides,
    },
  };
}

describe('postProcessArticles', () => {
  it('keeps both series as fixed capital and matches the applicant at 51%', () => {
    const payload = postProcessArticles(
      {
        legalName: 'MODIEBO',
        legalForm: 'S.A. de C.V.',
        rfc: null,
        assemblyDate: '2011-06-30',
        shareholders: edgardoTable,
        registry: { folio: '12345', date: '2011-07-15', place: 'Mérida' },
        administrationType: 'Administrador único',
        administration: [{ name: 'EDGARDO GONZÁLEZ HIGUERA', role: 'Administrador único' }],
      },
      {
        documentType: 'CORPORATE_AMENDMENT',
        applicantName: 'Edgardo González Higuera',
        now: new Date('2026-10-09T12:00:00.000Z'),
      },
    );

    expect(payload.actKind).toBe('AMENDMENT');
    expect(payload.rfc).toBeNull();
    expect(payload.alerts.map((alert) => alert.code)).toContain('RFC_AUSENTE');
    expect(payload.applicantShareholderName).toBe('EDGARDO GONZÁLEZ HIGUERA');
    expect(payload.applicantSharePercentage).toBe(51);
    expect(payload.shareholders[0].series.map((series) => series.capitalKind)).toEqual([
      'FIXED',
      'FIXED',
    ]);
    expect(payload.administrationType).toBe('SOLE');
    expect(payload.capTableChanged).toBe(true);
    expect(payload.registry.date).toBe('2011-07-15');
    expect(payload.isNonProfit).toBe(false);
  });

  it('flags a non-profit association and still returns the cap table', () => {
    const payload = postProcessArticles(
      {
        legalName: 'FUNDACION EJEMPLO',
        legalForm: 'Asociación Civil',
        isNonProfit: true,
        shareholders: [{ name: 'SOCIA UNO', percentage: '100%' }],
      },
      { documentType: 'ARTICLES_OF_INCORPORATION' },
    );

    expect(payload.isNonProfit).toBe(true);
    expect(payload.shareholders).toHaveLength(1);
    expect(payload.shareholders[0].percentage).toBe(100);
    const discard = payload.alerts.find(
      (alert) => alert.code === 'ASOCIACION_SIN_FINES_DE_LUCRO',
    );
    expect(discard?.severity).toBe('CRITICAL');
  });

  it('does not treat an S.A. de C.V. as a non-profit', () => {
    const payload = postProcessArticles(
      { legalName: 'MODIEBO', legalForm: 'S.A. de C.V.' },
      { documentType: 'ARTICLES_OF_INCORPORATION' },
    );

    expect(payload.isNonProfit).toBe(false);
  });

  it('warns when an amendment cap table has no inscription date', () => {
    const payload = postProcessArticles(
      { shareholders: edgardoTable, registry: { folio: null, date: null, place: null } },
      { documentType: 'CORPORATE_AMENDMENT' },
    );

    expect(payload.alerts.map((alert) => alert.code)).toContain(
      'MODIFICACION_SIN_INSCRIPCION',
    );
  });
});

describe('resolveVigentShareholding', () => {
  it('uses the later inscribed amendment for the 51% participation', () => {
    const resolved = resolveVigentShareholding([
      snapshot('constitutive', {
        shareholders: [
          { ...edgardoTable[0], percentage: 50 },
          { ...edgardoTable[1], percentage: 50 },
        ],
        applicantSharePercentage: 50,
        applicantShareholderName: 'EDGARDO GONZÁLEZ HIGUERA',
        registry: { folio: '1', date: '1997-05-01', place: null },
      }),
      snapshot('amendment', {
        documentType: 'CORPORATE_AMENDMENT',
        actKind: 'AMENDMENT',
        capTableChanged: true,
        shareholders: edgardoTable,
        applicantSharePercentage: 51,
        applicantShareholderName: 'EDGARDO GONZÁLEZ HIGUERA',
        registry: { folio: '2', date: '2011-07-15', place: null },
      }),
    ]);

    expect(resolved.documentId).toBe('amendment');
    expect(resolved.source).toBe('AMENDMENT');
    expect(resolved.applicantSharePercentage).toBe(51);
    expect(resolved.displacedByUnregisteredAmendment).toBe(false);
  });

  it('keeps an inscribed constitutive table when the amendment is not inscribed', () => {
    const resolved = resolveVigentShareholding([
      snapshot('constitutive', {
        shareholders: edgardoTable,
        applicantSharePercentage: 51,
        registry: { folio: '1', date: '1997-05-01', place: null },
      }),
      snapshot('amendment', {
        documentType: 'CORPORATE_AMENDMENT',
        actKind: 'AMENDMENT',
        shareholders: [{ ...edgardoTable[0], percentage: 80 }],
        applicantSharePercentage: 80,
        registry: { folio: null, date: null, place: null },
      }),
    ]);

    expect(resolved.documentId).toBe('constitutive');
    expect(resolved.applicantSharePercentage).toBe(51);
    expect(resolved.displacedByUnregisteredAmendment).toBe(true);
  });

  it('uses an unregistered amendment when it is the only cap table', () => {
    const resolved = resolveVigentShareholding([
      snapshot('amendment', {
        documentType: 'CORPORATE_AMENDMENT',
        actKind: 'AMENDMENT',
        shareholders: edgardoTable,
        applicantSharePercentage: 51,
        registry: { folio: null, date: null, place: null },
      }),
    ]);

    expect(resolved.documentId).toBe('amendment');
    expect(resolved.applicantSharePercentage).toBe(51);
  });
});
