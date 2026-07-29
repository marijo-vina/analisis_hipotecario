import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readProjectFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('HU-03 foundation artifacts', () => {
  it('defines the corrected MortgageCase preprofiling fields in Prisma schema', () => {
    const schema = readProjectFile('prisma/schema.prisma');

    expect(schema).toMatch(/enum\s+PersonType\s*\{[^}]*SALARIED[^}]*\}/s);
    expect(schema).toMatch(/personType\s+PersonType\s+@default\(SALARIED\)/);
    expect(schema).toMatch(/propertyLocation\s+String\?/);
    expect(schema).not.toMatch(/propertyLocation\s+String\?\s+@unique/);
    expect(schema).toMatch(/estimatedTermMonths\s+Int\?/);
    expect(schema).toMatch(/requestedAmount\s+Decimal\?/);
    expect(schema).toMatch(/propertyValue\s+Decimal\?/);
  });

  it('contains minimum CreditType and CaseStatus catalog seeds', () => {
    const seed = readProjectFile('prisma/seed.ts');

    const requiredCreditTypeCodes = [
      'COMPRA',
      'MEJORA_HIPOTECA',
      'LIQUIDEZ',
      'TERRENO',
      'REMODELACION',
      'CONSTRUCCION',
    ];

    const requiredCaseStatusCodes = [
      'PENDING_DOCUMENTS',
      'DOCUMENTS_UPLOADED',
      'DOCUMENTS_PROCESSED',
      'PRELIMINARY_RESULT',
    ];

    for (const code of requiredCreditTypeCodes) {
      expect(seed).toContain(`code: '${code}'`);
    }

    for (const code of requiredCaseStatusCodes) {
      expect(seed).toContain(`code: '${code}'`);
    }
  });
});
