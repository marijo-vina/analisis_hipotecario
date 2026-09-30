import { normalizeSatText } from './activity-factor-match';
import {
  NON_SUSCEPTIBLE_ACTIVITIES,
  matchBankScopedNonSusceptibleActivity,
  matchGlobalNonSusceptibleActivity,
} from './non-susceptible-activities';

const GLOBAL_CODES = [
  'GOBIERNO',
  'ONG',
  'PARTIDOS_POLITICOS',
  'IGLESIAS',
  'JOYERIA',
  'GASOLINERAS',
  'MOTELES',
  'MINERIA',
  'MINERIA_NO_METALICA',
  'ARMAS_FABRICACION',
  'ARMAS_COMERCIO',
  'ENTRETENIMIENTO_ADULTOS',
  'APROVECHAMIENTO_FORESTAL',
];

function globalEntries() {
  return NON_SUSCEPTIBLE_ACTIVITIES.filter(
    (entry) => entry.scope.kind === 'GLOBAL',
  );
}

describe('NON_SUSCEPTIBLE_ACTIVITIES catalog', () => {
  it('pins exactly the 13 global codes in policy order', () => {
    expect(globalEntries().map((entry) => entry.code)).toEqual(GLOBAL_CODES);
  });

  it('has unique codes, a Spanish label, and at least one alias per entry', () => {
    const codes = NON_SUSCEPTIBLE_ACTIVITIES.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const entry of globalEntries()) {
      expect(entry.label.trim().length).toBeGreaterThan(0);
      expect(entry.aliases.length).toBeGreaterThan(0);
    }
  });

  it('every alias matches its own entry once normalized with normalizeSatText', () => {
    for (const entry of globalEntries()) {
      for (const alias of entry.aliases) {
        const match = matchGlobalNonSusceptibleActivity(
          normalizeSatText(alias),
        );
        expect({ alias, kind: match.kind }).toEqual({
          alias,
          kind: 'excluded',
        });
      }
    }
  });
});

describe('matchGlobalNonSusceptibleActivity', () => {
  it.each([
    ['Comercio al por menor de gasolina y diésel', 'GASOLINERAS'],
    ['Minería de carbón mineral', 'MINERIA'],
    ['Minería de otros minerales no metálicos', 'MINERIA_NO_METALICA'],
    ['Actividades administrativas de gobierno estatal', 'GOBIERNO'],
    ['Actividades de embajadas y consulados', 'GOBIERNO'],
    ['Organizaciones no gubernamentales sin fines de lucro', 'ONG'],
    ['Asociaciones y organizaciones políticas', 'PARTIDOS_POLITICOS'],
    ['Asociaciones y organizaciones religiosas', 'IGLESIAS'],
    ['Comercio al por menor de artículos de joyería y relojes', 'JOYERIA'],
    ['Hoteles con otros servicios integrados y moteles', 'MOTELES'],
    ['Fabricación de armas de fuego y cartuchos', 'ARMAS_FABRICACION'],
    ['Comercio al por menor de armas de fuego', 'ARMAS_COMERCIO'],
    [
      'Centros nocturnos, bares, cantinas y similares',
      'ENTRETENIMIENTO_ADULTOS',
    ],
    ['Casinos, loterías y otros juegos de azar', 'ENTRETENIMIENTO_ADULTOS'],
    ['Aprovechamiento forestal de madera', 'APROVECHAMIENTO_FORESTAL'],
  ])('excludes "%s" as %s with global scope', (description, code) => {
    const match = matchGlobalNonSusceptibleActivity(description);
    expect(match).toEqual({
      kind: 'excluded',
      code,
      label: expect.any(String),
      scope: { kind: 'GLOBAL' },
    });
  });

  it('returns the catalog label on a hit', () => {
    const match = matchGlobalNonSusceptibleActivity('MOTELES');
    const motel = NON_SUSCEPTIBLE_ACTIVITIES.find(
      (entry) => entry.code === 'MOTELES',
    );
    expect(match).toEqual(
      expect.objectContaining({ kind: 'excluded', label: motel?.label }),
    );
  });

  it.each([
    ['Espectáculos de malabares y circo'],
    ['Instalación de alarmas y sistemas de seguridad'],
    ['Servicios de arquitectura'],
    ['Servicios de ingeniería'],
    ['Comercio al por menor en tiendas de abarrotes'],
    ['Fabricación de productos a base de minerales no metálicos'],
    ['Consultorios de medicina especializada'],
  ])('keeps "%s" eligible', (description) => {
    expect(matchGlobalNonSusceptibleActivity(description)).toEqual({
      kind: 'eligible',
    });
  });

  it.each([[null], [undefined], [''], ['   ']])(
    'treats %p as eligible',
    (description) => {
      expect(matchGlobalNonSusceptibleActivity(description)).toEqual({
        kind: 'eligible',
      });
    },
  );

  it('never returns a factor', () => {
    const match = matchGlobalNonSusceptibleActivity('Minería de carbón');
    expect(match).not.toHaveProperty('factor');
  });

  it('ignores the HSBC liquidity sheet', () => {
    expect(
      matchGlobalNonSusceptibleActivity(
        'Construcción de inmuebles comerciales, institucionales y de servicios',
      ),
    ).toEqual({ kind: 'eligible' });
    expect(
      matchGlobalNonSusceptibleActivity(
        'Servicios de contabilidad y auditoría',
      ),
    ).toEqual({
      kind: 'eligible',
    });
  });
});

const HSBC_CODES = [
  'CONSTRUCCION',
  'CASA_DE_MATERIALES',
  'DESPACHO_CONTABLE',
  'QUIMICA_FARMACEUTICA',
];

const HSBC_SCOPE = {
  kind: 'BANK',
  bankCode: 'HSBC',
  destinations: ['LIQUIDITY'],
  personTypes: ['PFAE', 'PM'],
};

function bankEntries() {
  return NON_SUSCEPTIBLE_ACTIVITIES.filter(
    (entry) => entry.scope.kind === 'BANK',
  );
}

function hsbcLiquidityPfae(description: string | null | undefined) {
  return matchBankScopedNonSusceptibleActivity({
    description,
    bankCode: 'HSBC',
    destination: 'LIQUIDITY',
    personType: 'PFAE',
  });
}

describe('HSBC liquidity sheet catalog', () => {
  it('pins the four HSBC subsectors, LIQUIDITY only, stored for PFAE and PM', () => {
    expect(bankEntries().map((entry) => entry.code)).toEqual(HSBC_CODES);
    for (const entry of bankEntries()) {
      expect(entry.scope).toEqual(HSBC_SCOPE);
      expect(entry.label.trim().length).toBeGreaterThan(0);
      expect(entry.aliases.length).toBeGreaterThan(0);
    }
  });

  it('keeps the 13 global entries out of the bank scope', () => {
    expect(NON_SUSCEPTIBLE_ACTIVITIES).toHaveLength(
      GLOBAL_CODES.length + HSBC_CODES.length,
    );
  });

  it('every HSBC alias matches its own subsector for HSBC + LIQUIDITY + PFAE', () => {
    for (const entry of bankEntries()) {
      for (const alias of entry.aliases) {
        const match = hsbcLiquidityPfae(normalizeSatText(alias));
        expect({
          alias,
          code: match.kind === 'excluded' ? match.code : null,
        }).toEqual({
          alias,
          code: entry.code,
        });
      }
    }
  });
});

describe('matchBankScopedNonSusceptibleActivity', () => {
  it.each([
    [
      'Construcción de inmuebles comerciales, institucionales y de servicios',
      'CONSTRUCCION',
    ],
    ['Edificación residencial', 'CONSTRUCCION'],
    ['Construcción de obras de urbanización', 'CONSTRUCCION'],
    ['Trabajos de albañilería', 'CONSTRUCCION'],
    ['Comercio al por menor de cemento, tabique y grava', 'CASA_DE_MATERIALES'],
    [
      'Comercio al por mayor de otros materiales para la construcción, excepto de madera',
      'CASA_DE_MATERIALES',
    ],
    ['Servicios de contabilidad y auditoría', 'DESPACHO_CONTABLE'],
    ['Otros servicios relacionados con la contabilidad', 'DESPACHO_CONTABLE'],
    ['Fabricación de productos farmacéuticos', 'QUIMICA_FARMACEUTICA'],
    ['Fabricación de fertilizantes', 'QUIMICA_FARMACEUTICA'],
    [
      'Fabricación de cosméticos, perfumes y otras preparaciones de tocador',
      'QUIMICA_FARMACEUTICA',
    ],
  ])('restricts "%s" as %s for HSBC liquidity', (description, code) => {
    expect(hsbcLiquidityPfae(description)).toEqual({
      kind: 'excluded',
      code,
      label: expect.any(String),
      scope: HSBC_SCOPE,
    });
  });

  it.each([
    ['Servicios de arquitectura'],
    ['Servicios de ingeniería'],
    ['Servicios de arquitectura y de ingeniería para la construcción'],
    ['Ingeniero civil independiente'],
    ['Arquitecto'],
    ['Comercio al por menor en tiendas de abarrotes'],
    ['Comercio al por menor de artículos de perfumería y cosméticos'],
  ])('keeps "%s" eligible for HSBC liquidity', (description) => {
    expect(hsbcLiquidityPfae(description)).toEqual({ kind: 'eligible' });
  });

  it.each([
    [
      'another bank',
      { bankCode: 'MIFEL', destination: 'LIQUIDITY', personType: 'PFAE' },
    ],
    [
      'HSBC acquisition',
      { bankCode: 'HSBC', destination: 'ACQUISITION', personType: 'PFAE' },
    ],
    [
      'HSBC mortgage replacement',
      {
        bankCode: 'HSBC',
        destination: 'MORTGAGE_REPLACEMENT',
        personType: 'PFAE',
      },
    ],
    [
      'a null destination',
      { bankCode: 'HSBC', destination: null, personType: 'PFAE' },
    ],
    [
      'a salaried applicant',
      { bankCode: 'HSBC', destination: 'LIQUIDITY', personType: 'SALARIED' },
    ],
    [
      'PM at runtime',
      { bankCode: 'HSBC', destination: 'LIQUIDITY', personType: 'PM' },
    ],
  ])('keeps construction eligible for %s', (_label, input) => {
    expect(
      matchBankScopedNonSusceptibleActivity({
        description:
          'Construcción de inmuebles comerciales, institucionales y de servicios',
        ...input,
      }),
    ).toEqual({ kind: 'eligible' });
  });

  it('does not duplicate the global list per bank', () => {
    expect(hsbcLiquidityPfae('Minería de carbón')).toEqual({
      kind: 'eligible',
    });
  });

  it.each([[null], [undefined], [''], ['   ']])(
    'treats %p as eligible',
    (description) => {
      expect(hsbcLiquidityPfae(description)).toEqual({ kind: 'eligible' });
    },
  );
});
