import { matchActivityFactor } from './activity-factor-match';

function factorRow(
  overrides: {
    nativeLabel?: string;
    satAliases?: string[];
    factor?: number;
    factorTaxReturn?: number | null;
  } = {},
) {
  return {
    nativeLabel: overrides.nativeLabel ?? 'Comercio',
    satAliases: overrides.satAliases ?? ['comercio'],
    factor: overrides.factor ?? 0.35,
    factorTaxReturn: overrides.factorTaxReturn ?? null,
  };
}

describe('matchActivityFactor', () => {
  it('skips matching when mode is FLAT even if SAT text has no alias', () => {
    const result = matchActivityFactor({
      pfaeFactorMode: 'FLAT',
      satDescription: 'Cultivo de maíz',
      activityFactors: [factorRow({ satAliases: ['comercio'] })],
    });

    expect(result.kind).toBe('skip');
    expect(result).toEqual(expect.objectContaining({ kind: 'skip', mode: 'FLAT' }));
  });

  it('skips matching when mode is NONE', () => {
    const result = matchActivityFactor({
      pfaeFactorMode: 'NONE',
      satDescription: 'Cultivo de maíz',
      activityFactors: [factorRow()],
    });

    expect(result.kind).toBe('skip');
    expect(result).toEqual(expect.objectContaining({ kind: 'skip', mode: 'NONE' }));
  });

  it('returns a MATRIX hit when the CSF description contains a SAT alias', () => {
    const result = matchActivityFactor({
      pfaeFactorMode: 'MATRIX',
      satDescription: 'Comercio al por menor de abarrotes',
      activityFactors: [
        factorRow({
          nativeLabel: 'Comercio, alojamiento',
          satAliases: ['comercio', 'hoteles'],
          factor: 0.35,
          factorTaxReturn: 0.4,
        }),
      ],
    });

    expect(result).toEqual({
      kind: 'hit',
      nativeLabel: 'Comercio, alojamiento',
      factor: 0.35,
      factorTaxReturn: 0.4,
    });
  });

  it('returns a MATRIX miss when no alias matches the CSF description', () => {
    const result = matchActivityFactor({
      pfaeFactorMode: 'MATRIX',
      satDescription: 'Consultorios de medicina especializada',
      activityFactors: [
        factorRow({ satAliases: ['comercio', 'hoteles'] }),
        factorRow({
          nativeLabel: 'Agropecuarias',
          satAliases: ['ganaderia', 'pesca'],
          factor: 0.1,
        }),
      ],
    });

    expect(result).toEqual({ kind: 'miss' });
  });

  it('normalizes NFD marks so ganadería matches alias ganaderia', () => {
    const result = matchActivityFactor({
      pfaeFactorMode: 'MATRIX',
      satDescription: 'Cría y explotación de ganadería bovina',
      activityFactors: [
        factorRow({
          nativeLabel: 'Agropecuarias, pesca, forestales',
          satAliases: ['ganaderia', 'pesca'],
          factor: 0.1,
        }),
      ],
    });

    expect(result.kind).toBe('hit');
    expect(result).toEqual(
      expect.objectContaining({
        kind: 'hit',
        nativeLabel: 'Agropecuarias, pesca, forestales',
        factor: 0.1,
      }),
    );
  });

  it('returns MATRIX miss when activityFactors is empty', () => {
    const result = matchActivityFactor({
      pfaeFactorMode: 'MATRIX',
      satDescription: 'Comercio al por menor',
      activityFactors: [],
    });

    expect(result).toEqual({ kind: 'miss' });
  });
});
