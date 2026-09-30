import { normalizeSatText } from './activity-factor-match';

export type NonSusceptibleScope = { kind: 'GLOBAL' };

export interface NonSusceptibleEntry {
  code: string;
  label: string;
  aliases: string[];
  scope: NonSusceptibleScope;
}

export type NonSusceptibleMatch =
  | { kind: 'eligible' }
  | {
      kind: 'excluded';
      code: string;
      label: string;
      scope: NonSusceptibleScope;
    };

const GLOBAL: NonSusceptibleScope = { kind: 'GLOBAL' };

/**
 * Closed policy: giros excluded from financing for every bank and destination.
 * Source: docs/bank-policies-matrix.md, "Giros no susceptibles" (sep-2026).
 * Aliases are SAT phrasing matched on word boundaries; never a factor.
 */
export const NON_SUSCEPTIBLE_ACTIVITIES: readonly NonSusceptibleEntry[] = [
  {
    code: 'GOBIERNO',
    label: 'Gobierno federal, estatal y municipal (incluye embajadas)',
    aliases: [
      'gobierno',
      'administración pública',
      'actividades legislativas',
      'embajada',
      'embajadas',
      'consulado',
      'consulados',
    ],
    scope: GLOBAL,
  },
  {
    code: 'ONG',
    label: 'ONG y actividades no lucrativas',
    aliases: [
      'ong',
      'organizaciones no gubernamentales',
      'organización no gubernamental',
      'sin fines de lucro',
      'no lucrativa',
      'no lucrativas',
      'asociaciones y organizaciones civiles',
      'donataria',
      'donatarias',
    ],
    scope: GLOBAL,
  },
  {
    code: 'PARTIDOS_POLITICOS',
    label: 'Partidos políticos',
    aliases: [
      'partido político',
      'partidos políticos',
      'asociaciones y organizaciones políticas',
    ],
    scope: GLOBAL,
  },
  {
    code: 'IGLESIAS',
    label: 'Iglesias',
    aliases: [
      'iglesia',
      'iglesias',
      'asociaciones religiosas',
      'asociaciones y organizaciones religiosas',
      'culto religioso',
    ],
    scope: GLOBAL,
  },
  {
    code: 'JOYERIA',
    label: 'Joyería (manufactura y/o comercio)',
    aliases: ['joyería', 'orfebrería'],
    scope: GLOBAL,
  },
  {
    code: 'GASOLINERAS',
    label: 'Gasolineras',
    aliases: ['gasolina', 'gasolinera', 'gasolineras'],
    scope: GLOBAL,
  },
  {
    code: 'MOTELES',
    label: 'Moteles',
    aliases: ['motel', 'moteles'],
    scope: GLOBAL,
  },
  {
    code: 'MINERIA',
    label: 'Minería',
    aliases: ['minería', 'minerales metálicos', 'extracción de carbón'],
    scope: GLOBAL,
  },
  {
    code: 'MINERIA_NO_METALICA',
    label: 'Minería de productos no metálicos',
    aliases: [
      'minería de productos no metálicos',
      'minería de minerales no metálicos',
      'minería de otros minerales no metálicos',
      'minería de piedra',
      'minería de arena',
      'minería de arcillas',
      'minería de yeso',
      'minería de sal',
    ],
    scope: GLOBAL,
  },
  {
    code: 'ARMAS_FABRICACION',
    label: 'Fabricación de armas de fuego, cartuchos y explosivos',
    aliases: [
      'fabricación de armas',
      'fabricación de cartuchos',
      'fabricación de explosivos',
    ],
    scope: GLOBAL,
  },
  {
    code: 'ARMAS_COMERCIO',
    label: 'Comercio de armas de fuego, cartuchos y explosivos',
    aliases: [
      'armas',
      'armas de fuego',
      'explosivos',
      'comercio de armas',
      'comercio al por menor de armas',
      'comercio al por mayor de armas',
    ],
    scope: GLOBAL,
  },
  {
    code: 'ENTRETENIMIENTO_ADULTOS',
    label:
      'Entretenimiento para adultos (centros nocturnos, bares, cantinas, billares, casinos y similares)',
    aliases: [
      'centro nocturno',
      'centros nocturnos',
      'discoteca',
      'discotecas',
      'bares',
      'cantina',
      'cantinas',
      'salones de billar',
      'billar',
      'cervecería',
      'cervecerías',
      'pulquería',
      'pulquerías',
      'plaza de toros',
      'plazas de toros',
      'casino',
      'casinos',
      'juegos de azar',
    ],
    scope: GLOBAL,
  },
  {
    code: 'APROVECHAMIENTO_FORESTAL',
    label: 'Aprovechamiento forestal',
    aliases: [
      'aprovechamiento forestal',
      'explotación forestal',
      'silvicultura',
      'tala de árboles',
    ],
    scope: GLOBAL,
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aliasPattern(alias: string): RegExp {
  const body = normalizeSatText(alias)
    .trim()
    .split(/\s+/)
    .map(escapeRegExp)
    .join('\\s+');
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`);
}

type CompiledEntry = {
  entry: NonSusceptibleEntry;
  patterns: { length: number; regex: RegExp }[];
};

const COMPILED: CompiledEntry[] = NON_SUSCEPTIBLE_ACTIVITIES.map((entry) => ({
  entry,
  patterns: entry.aliases.map((alias) => ({
    length: alias.length,
    regex: aliasPattern(alias),
  })),
}));

const COMPILED_GLOBAL = COMPILED.filter(
  ({ entry }) => entry.scope.kind === 'GLOBAL',
);

/**
 * The longest matching alias wins so specific phrasing
 * ("fabricación de armas", "minería de ... no metálicos") beats generic words.
 */
export function matchGlobalNonSusceptibleActivity(
  description: string | null | undefined,
): NonSusceptibleMatch {
  return matchAgainst(description, COMPILED_GLOBAL);
}

function matchAgainst(
  description: string | null | undefined,
  candidates: CompiledEntry[],
): NonSusceptibleMatch {
  const haystack = description ? normalizeSatText(description).trim() : '';
  if (!haystack || candidates.length === 0) return { kind: 'eligible' };

  let best: { entry: NonSusceptibleEntry; length: number } | null = null;
  for (const { entry, patterns } of candidates) {
    for (const { length, regex } of patterns) {
      if (regex.test(haystack) && (best === null || length > best.length)) {
        best = { entry, length };
      }
    }
  }

  if (!best) return { kind: 'eligible' };
  return {
    kind: 'excluded',
    code: best.entry.code,
    label: best.entry.label,
    scope: best.entry.scope,
  };
}
