import { normalizeSatText } from './activity-factor-match';
import {
  NON_SUSCEPTIBLE_ACTIVITIES,
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
