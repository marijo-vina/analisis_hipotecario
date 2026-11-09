import { extractCompanyShareholders } from './bureau-shareholders';

describe('company bureau shareholders', () => {
  it('reads the two shareholders and their percentages', () => {
    const ocr = [
      'ACCIONISTAS',
      'R.F.C. Nombre Dirección Participación',
      'FIFI910227DJ7 INGRID VERONICA FRIAS FUENTES C 19 PR 18 A 401 LT 11 ALTABRISA 97130 YUC MX 49%',
      'FIFJ9306245J4 JUAN ANTONIO FRIAS FUENTES 101 131 PROGRESO 97320 YUC MX 51%',
      'AVALISTA DE',
    ].join('\n');

    expect(extractCompanyShareholders(ocr)).toEqual([
      { rfc: 'FIFI910227DJ7', name: 'INGRID VERONICA FRIAS FUENTES', percentage: 49 },
      { rfc: 'FIFJ9306245J4', name: 'JUAN ANTONIO FRIAS FUENTES', percentage: 51 },
    ]);
  });

  it('reads the two shareholders when Document AI splits the columns', () => {
    const ocr = [
      'ACCIONISTAS',
      'R.F.C.',
      'FIFI910227DJ7',
      'Nombre',
      'INGRID VERONICA FRIAS FUENTES',
      'FIFJ9306245J4',
      'AVALISTA DE',
      'JUAN ANTONIO FRIAS FUENTES',
      'RESUMEN DE CRÉDITOS',
      'Participación',
      '49%',
      '51%',
    ].join('\n');

    expect(extractCompanyShareholders(ocr)).toEqual([
      { rfc: 'FIFI910227DJ7', name: 'INGRID VERONICA FRIAS FUENTES', percentage: 49 },
      { rfc: 'FIFJ9306245J4', name: 'JUAN ANTONIO FRIAS FUENTES', percentage: 51 },
    ]);
  });

  it('returns nothing when the report has no shareholder section', () => {
    expect(extractCompanyShareholders('Nombre: MARIA PEREZ\nRFC: PEPM800101ABC')).toEqual([]);
  });
});
