import { capitalSuffixFromOcr, joinCompanyLegalName } from './csf-capital-regime';

describe('company CSF capital regime', () => {
  it('reads a glued sociedad anónima de capital variable', () => {
    const ocr = 'Denominación/RazónSocial: ALIMENTOSRAPIDOSPENINSULARES\nRégimenCapital: SOCIEDADANONIMADECAPITALVARIABLE\n';
    expect(capitalSuffixFromOcr(ocr)).toBe('SA DE CV');
  });

  it('reads the same regime when the words are separated', () => {
    const ocr = 'Régimen de capital: SOCIEDAD ANONIMA DE CAPITAL VARIABLE';
    expect(capitalSuffixFromOcr(ocr)).toBe('SA DE CV');
  });

  it('appends the suffix once', () => {
    expect(joinCompanyLegalName('ALIMENTOS RAPIDOS PENINSULARES', 'SA DE CV')).toBe(
      'ALIMENTOS RAPIDOS PENINSULARES SA DE CV',
    );
    expect(
      joinCompanyLegalName('ALIMENTOS RAPIDOS PENINSULARES S.A. DE C.V.', 'SA DE CV'),
    ).toBe('ALIMENTOS RAPIDOS PENINSULARES S.A. DE C.V.');
  });
});
