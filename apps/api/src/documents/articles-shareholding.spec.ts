import {
  completedShareTenureMonths,
  postProcessArticles,
  resolveApplicantShareEntry,
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
    entryDate: null,
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
    entryDate: null,
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
      applicantShareEntryDate: null,
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
    expect(resolved.applicantShareEntryDate).toBe('1997-04-28');
    expect(resolved.applicantShareEntrySource).toBe('CONSTITUTIVE');
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
    expect(resolved.applicantShareEntryDate).toBeNull();
    expect(resolved.applicantShareEntrySource).toBe('UNKNOWN');
  });
});

describe('resolveApplicantShareEntry', () => {
  it('keeps the constitutive date when a later amendment only changes the percentage', () => {
    const entry = resolveApplicantShareEntry([
      snapshot('constitutive', {
        shareholders: edgardoTable,
        applicantShareholderName: 'EDGARDO GONZÁLEZ HIGUERA',
        applicantSharePercentage: 50,
        incorporationDate: '1997-04-28',
      }),
      snapshot('amendment', {
        documentType: 'CORPORATE_AMENDMENT',
        actKind: 'AMENDMENT',
        shareholders: edgardoTable,
        applicantShareholderName: 'EDGARDO GONZÁLEZ HIGUERA',
        applicantSharePercentage: 51,
        incorporationDate: null,
        assemblyDate: '2011-06-30',
      }),
    ]);

    expect(entry).toEqual({ entryDate: '1997-04-28', source: 'CONSTITUTIVE' });
  });

  it('uses the assembly date when the constitutive table does not include the applicant', () => {
    const entry = resolveApplicantShareEntry([
      snapshot('constitutive', {
        shareholders: [edgardoTable[1]],
        applicantShareholderName: null,
        incorporationDate: '1997-04-28',
      }),
      snapshot('admission', {
        documentType: 'CORPORATE_AMENDMENT',
        actKind: 'AMENDMENT',
        shareholders: edgardoTable,
        applicantShareholderName: 'EDGARDO GONZÁLEZ HIGUERA',
        assemblyDate: '2018-03-01',
        incorporationDate: null,
      }),
    ]);

    expect(entry).toEqual({ entryDate: '2018-03-01', source: 'ADMISSION' });
  });

  it('uses an explicit acquisition date when no constitutive table proves an earlier entry', () => {
    const entry = resolveApplicantShareEntry([
      snapshot('amendment', {
        documentType: 'CORPORATE_AMENDMENT',
        actKind: 'AMENDMENT',
        shareholders: [{ ...edgardoTable[0], entryDate: '2015-01-10' }],
        applicantShareholderName: 'EDGARDO GONZÁLEZ HIGUERA',
        assemblyDate: '2016-08-01',
        incorporationDate: null,
      }),
    ]);

    expect(entry).toEqual({ entryDate: '2015-01-10', source: 'EXPLICIT' });
  });

  it('does not treat a lone amendment date as the entry date', () => {
    const entry = resolveApplicantShareEntry([
      snapshot('amendment', {
        documentType: 'CORPORATE_AMENDMENT',
        actKind: 'AMENDMENT',
        shareholders: edgardoTable,
        applicantShareholderName: 'EDGARDO GONZÁLEZ HIGUERA',
        assemblyDate: '2011-06-30',
        incorporationDate: null,
      }),
    ]);

    expect(entry).toEqual({ entryDate: null, source: 'UNKNOWN' });
  });
});

describe('completedShareTenureMonths', () => {
  const on = (year: number, month: number, day: number) => new Date(year, month - 1, day);

  it('counts completed months and withholds the current month until the entry day', () => {
    expect(completedShareTenureMonths('1997-04-28', on(2026, 10, 22))).toBe(353);
    expect(completedShareTenureMonths('1997-04-28', on(2026, 10, 28))).toBe(354);
  });

  it('counts an exact two-year anniversary as 24 months', () => {
    expect(completedShareTenureMonths('2024-10-22', on(2026, 10, 22))).toBe(24);
    expect(completedShareTenureMonths('2024-10-22', on(2026, 10, 21))).toBe(23);
  });

  it('returns zero when the entry date is still ahead', () => {
    expect(completedShareTenureMonths('2026-11-01', on(2026, 10, 22))).toBe(0);
    expect(completedShareTenureMonths('no-es-fecha', on(2026, 10, 22))).toBeNull();
  });
});

describe('founder entry dates', () => {
  it('stamps the incorporation date on constitutive shareholders and leaves an amendment untouched', () => {
    const constitutive = postProcessArticles(
      {
        incorporationDate: '1997-04-28',
        shareholders: [{ name: 'EDGARDO GONZALEZ HIGUERA', percentage: 50 }],
      },
      {
        documentType: 'ARTICLES_OF_INCORPORATION',
        applicantName: 'Edgardo González Higuera',
      },
    );
    const amendment = postProcessArticles(
      {
        assemblyDate: '2011-06-30',
        shareholders: [{ name: 'EDGARDO GONZALEZ HIGUERA', percentage: 51 }],
      },
      {
        documentType: 'CORPORATE_AMENDMENT',
        applicantName: 'Edgardo González Higuera',
      },
    );

    expect(constitutive.applicantShareEntryDate).toBe('1997-04-28');
    expect(constitutive.shareholders[0].entryDate).toBe('1997-04-28');
    expect(amendment.applicantShareEntryDate).toBeNull();
    expect(amendment.shareholders[0].entryDate).toBeNull();
  });
});
