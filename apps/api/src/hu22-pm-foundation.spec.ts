import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function readProjectFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

const MIGRATION_RELATIVE_PATH =
  'prisma/migrations/20261007120000_hu22_person_type_pm/migration.sql';

describe('HU-22 PM foundation artifacts', () => {
  it('keeps SALARIED and PFAE on PersonType and adds PM', () => {
    const schema = readProjectFile('prisma/schema.prisma');
    const personTypeEnum = schema.match(/enum\s+PersonType\s*\{[^}]*\}/s)?.[0];

    expect(personTypeEnum).toBeDefined();
    expect(personTypeEnum).toMatch(/\bSALARIED\b/);
    expect(personTypeEnum).toMatch(/\bPFAE\b/);
    expect(personTypeEnum).toMatch(/\bPM\b/);
    expect(personTypeEnum).not.toMatch(/\bMORAL\b/);
  });

  it('defines DocumentOwner and defaults Document.owner to SHAREHOLDER', () => {
    const schema = readProjectFile('prisma/schema.prisma');
    const ownerEnum = schema.match(/enum\s+DocumentOwner\s*\{[^}]*\}/s)?.[0];
    const documentModel = schema.match(/model\s+Document\s*\{[\s\S]*?\n\}/)?.[0];

    expect(ownerEnum).toBeDefined();
    expect(ownerEnum).toMatch(/\bSHAREHOLDER\b/);
    expect(ownerEnum).toMatch(/\bCOMPANY\b/);
    expect(documentModel).toBeDefined();
    expect(documentModel).toMatch(
      /owner\s+DocumentOwner\s+@default\(SHAREHOLDER\)/,
    );
  });

  it('adds optional corporate columns on MortgageCase without unique companyRfc', () => {
    const schema = readProjectFile('prisma/schema.prisma');
    const mortgageCase = schema.match(
      /model\s+MortgageCase\s*\{[\s\S]*?\n\}/,
    )?.[0];

    expect(mortgageCase).toBeDefined();
    expect(mortgageCase).toMatch(
      /sharePercentage\s+Decimal\?\s+@db\.Decimal\(5,\s*2\)/,
    );
    expect(mortgageCase).toMatch(/incorporationDate\s+DateTime\?\s+@db\.Date/);
    expect(mortgageCase).toMatch(/shareTenureMonths\s+Int\?/);
    expect(mortgageCase).toMatch(/legalName\s+String\?/);
    expect(mortgageCase).toMatch(/companyRfc\s+String\?/);
    expect(mortgageCase).not.toMatch(/companyRfc\s+String\?\s+@unique/);
  });

  it('seeds ARTICLES_OF_INCORPORATION without an extractor', () => {
    const seed = readProjectFile('prisma/seed.ts');
    const articlesEntry = seed.match(
      /\{[^{}]*code:\s*'ARTICLES_OF_INCORPORATION'[^{}]*\}/s,
    )?.[0];

    expect(articlesEntry).toBeDefined();
    expect(articlesEntry).toContain("name: 'Acta constitutiva'");
    expect(articlesEntry).toContain('isActive: true');
    expect(articlesEntry).not.toMatch(/extractor/i);
    expect(seed).toContain("code: 'PAYROLL_RECEIPT'");
    expect(seed).toContain("code: 'CSF'");
  });

  it('ships additive PersonType PM migration SQL in the PFAE style', () => {
    const migrationPath = join(process.cwd(), MIGRATION_RELATIVE_PATH);

    expect(existsSync(migrationPath)).toBe(true);

    const sql = readProjectFile(MIGRATION_RELATIVE_PATH);

    expect(sql).toContain(`ALTER TYPE "PersonType" ADD VALUE 'PM'`);
    expect(sql).toMatch(
      /CREATE TYPE "DocumentOwner" AS ENUM \(\s*'SHAREHOLDER',\s*'COMPANY'\s*\)/,
    );
    expect(sql).toMatch(
      /ALTER TABLE "Document"[\s\S]*ADD COLUMN\s+"owner" "DocumentOwner" NOT NULL DEFAULT 'SHAREHOLDER'/,
    );
    expect(sql).toMatch(/ALTER TABLE "MortgageCase"[\s\S]*"sharePercentage" DECIMAL\(5,\s*2\)/);
    expect(sql).toMatch(/"incorporationDate" DATE/);
    expect(sql).toMatch(/"shareTenureMonths" INTEGER/);
    expect(sql).toMatch(/"legalName" TEXT/);
    expect(sql).toMatch(/"companyRfc" TEXT/);
  });
});
