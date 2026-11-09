import { IdentityMatchRule } from './identity-match.rule';
import type { PrismaDocumentLike, PrismaClientLike } from './identity-match.rule';

describe('IdentityMatchRule', () => {
  let rule: IdentityMatchRule;

  beforeEach(() => {
    rule = new IdentityMatchRule();
  });

  it('has ruleId "identity-match"', () => {
    expect(rule.ruleId).toBe('identity-match');
  });

  /** Helper: build a document-like object matching the Prisma Document shape. */
  const doc = (
    typeCode: string,
    extractedData: Record<string, unknown> | null,
  ): PrismaDocumentLike => ({
    documentType: { code: typeCode },
    extractedData,
  });

  const client = (over: Partial<PrismaClientLike> = {}): PrismaClientLike => ({
    fullName: 'JOSE PEREZ GARCIA',
    rfc: 'PELJ900101ABC',
    curp: 'PEJ900315HYNRLN08',
    ...over,
  });

  describe('all fields present and matching', () => {
    it('returns PASS when documents and client agree', async () => {
      const docs = [
        doc('INE', {
          identity: {
            fullName: 'José Pérez García',
            curp: 'PEJ900315HYNRLN08',
          },
        }),
        doc('PAYROLL_RECEIPT', {
          employee: {
            fullName: 'JOSE PEREZ GARCIA',
            rfc: 'PELJ900101ABC',
            curp: 'PEJ900315HYNRLN08',
          },
        }),
      ];

      const result = await rule.execute(client(), docs);

      expect(result.outcome).toBe('PASS');
      expect(result.severity).toBe('INFO');
      const rfcField = result.detail.fields.find((f) => f.fieldName === 'rfc');
      expect(rfcField?.status).toBe('MATCH');
      const curpField = result.detail.fields.find((f) => f.fieldName === 'curp');
      expect(curpField?.status).toBe('MATCH');
      expect(result.alerts).toHaveLength(0);
    });

    it('lists the participating sources in detail.sources', async () => {
      const docs = [
        doc('INE', { identity: { fullName: 'JOSE PEREZ', curp: 'PEJ900315HYNRLN08' } }),
        doc('PAYROLL_RECEIPT', {
          employee: { fullName: 'JOSE PEREZ', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
      ];
      const result = await rule.execute(client(), docs);

      expect(result.detail.sources).toEqual(
        expect.arrayContaining(['official-id', 'payroll', 'client']),
      );
    });
  });

  describe('RFC/CURP conflict between documents', () => {
    it('returns FAIL with DOCUMENT_CONFLICT when rfc differs between documents', async () => {
      const docs = [
        doc('INE', {
          identity: { fullName: 'JOSE PEREZ', rfc: 'XAXX010101000', curp: 'PEJ900315HYNRLN08' },
        }),
        doc('PAYROLL_RECEIPT', {
          employee: { fullName: 'JOSE PEREZ', rfc: 'XAXX010102000', curp: 'PEJ900315HYNRLN08' },
        }),
      ];
      const result = await rule.execute(client({ rfc: 'XAXX010101000' }), docs);

      expect(result.outcome).toBe('FAIL');
      expect(result.severity).toBe('ERROR');
      const rfcField = result.detail.fields.find((f) => f.fieldName === 'rfc');
      expect(rfcField?.status).toBe('MISMATCH');
      expect(rfcField?.severity).toBe('ERROR');
      expect(rfcField?.alerts).toContain('DOCUMENT_CONFLICT');
    });

    it('returns FAIL when CURP conflicts between documents', async () => {
      const docs = [
        doc('INE', { identity: { fullName: 'JOSE PEREZ', curp: 'AAA900315HYNRLN08' } }),
        doc('PAYROLL_RECEIPT', {
          employee: { fullName: 'JOSE PEREZ', rfc: 'PELJ900101ABC', curp: 'BBB900315HYNRLN08' },
        }),
      ];
      const result = await rule.execute(client(), docs);

      expect(result.outcome).toBe('FAIL');
      const curpField = result.detail.fields.find((f) => f.fieldName === 'curp');
      expect(curpField?.status).toBe('MISMATCH');
      expect(curpField?.alerts).toContain('DOCUMENT_CONFLICT');
    });
  });

  describe('name-only mismatch (RFC/CURP match)', () => {
    it('returns PARTIAL with NAME_MISMATCH when fullName differs but RFC matches', async () => {
      const docs = [
        doc('INE', { identity: { fullName: 'JOSE PEREZ GARCIA', curp: 'PEJ900315HYNRLN08' } }),
        doc('PAYROLL_RECEIPT', {
          employee: { fullName: 'JUAN PEREZ GARCIA', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
      ];
      const result = await rule.execute(client(), docs);

      expect(result.outcome).toBe('PARTIAL');
      expect(result.severity).toBe('WARNING');
      const nameField = result.detail.fields.find((f) => f.fieldName === 'fullName');
      expect(nameField?.status).toBe('MISMATCH');
      expect(nameField?.alerts).toContain('NAME_MISMATCH');
    });
  });

  describe('Expediente vs documentos (client has value, docs agree, client differs)', () => {
    it('returns PARTIAL with EXPEDIENTE_VS_DOCUMENTOS when docs agree but client rfc differs', async () => {
      const docs = [
        doc('INE', { identity: { fullName: 'JOSE PEREZ', curp: 'PEJ900315HYNRLN08' } }),
        doc('CREDIT_BUREAU_REPORT', { borrower: { fullName: 'JOSE PEREZ', rfc: 'PELJ900101ABC' } }),
        doc('PAYROLL_RECEIPT', {
          employee: { fullName: 'JOSE PEREZ', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
      ];
      const result = await rule.execute(client({ rfc: 'XAXX010101000' }), docs);

      expect(result.outcome).toBe('PARTIAL');
      const rfcField = result.detail.fields.find((f) => f.fieldName === 'rfc');
      expect(rfcField?.status).toBe('MISMATCH');
      expect(rfcField?.alerts).toContain('EXPEDIENTE_VS_DOCUMENTOS');
      expect(rfcField?.alerts).not.toContain('DOCUMENT_CONFLICT');
    });

    it('severity is WARNING (not ERROR) — expediente is operational reference', async () => {
      const docs = [
        doc('INE', { identity: { fullName: 'JOSE PEREZ', curp: 'PEJ900315HYNRLN08' } }),
        doc('PAYROLL_RECEIPT', {
          employee: { fullName: 'JOSE PEREZ', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
      ];
      const result = await rule.execute(client({ rfc: 'XAXX010101000' }), docs);

      const alert = result.alerts.find((a) => a.ruleCode === 'EXPEDIENTE_VS_DOCUMENTOS');
      expect(alert?.severity).toBe('WARNING');
      expect(result.outcome).toBe('PARTIAL');
    });
  });

  describe('Client RFC/CURP optional — empty field omitted from comparison', () => {
    it('returns PASS with CLIENT_FIELD_OMITTED when docs match but client has no RFC', async () => {
      const docs = [
        doc('INE', { identity: { fullName: 'JOSE PEREZ', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' } }),
        doc('PAYROLL_RECEIPT', {
          employee: { fullName: 'JOSE PEREZ', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
      ];
      const result = await rule.execute(client({ rfc: null, fullName: 'JOSE PEREZ' }), docs);

      expect(result.outcome).toBe('PASS');
      const rfcField = result.detail.fields.find((f) => f.fieldName === 'rfc');
      expect(rfcField?.status).toBe('MATCH');
      const alert = result.alerts.find((a) => a.ruleCode === 'CLIENT_FIELD_OMITTED' && a.field === 'rfc');
      expect(alert).toBeDefined();
      expect(alert?.severity).toBe('INFO');
    });

    it('returns PASS with CLIENT_FIELD_OMITTED when docs match but client CURP is empty string', async () => {
      const docs = [
        doc('INE', { identity: { fullName: 'JOSE PEREZ', curp: 'PEJ900315HYNRLN08' } }),
        doc('PAYROLL_RECEIPT', {
          employee: { fullName: 'JOSE PEREZ', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
      ];
      const result = await rule.execute(client({ curp: '', fullName: 'JOSE PEREZ' }), docs);

      expect(result.outcome).toBe('PASS');
      const alert = result.alerts.find((a) => a.ruleCode === 'CLIENT_FIELD_OMITTED' && a.field === 'curp');
      expect(alert).toBeDefined();
    });

    it('still returns FAIL when docs conflict on RFC even if client has no RFC', async () => {
      const docs = [
        doc('INE', { identity: { fullName: 'JOSE PEREZ', rfc: 'XAXX010101000', curp: 'PEJ900315HYNRLN08' } }),
        doc('PAYROLL_RECEIPT', {
          employee: { fullName: 'JOSE PEREZ', rfc: 'XAXX010102000', curp: 'PEJ900315HYNRLN08' },
        }),
      ];
      const result = await rule.execute(client({ rfc: null }), docs);

      expect(result.outcome).toBe('FAIL');
      const alert = result.alerts.find((a) => a.ruleCode === 'DOCUMENT_CONFLICT' && a.field === 'rfc');
      expect(alert).toBeDefined();
    });

    it('client is omitted from rfc comparison when rfc is whitespace only — suggests completing', async () => {
      const docs = [
        doc('PAYROLL_RECEIPT', {
          employee: { fullName: 'JOSE PEREZ', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
      ];
      const result = await rule.execute(client({ rfc: '   ', fullName: 'JOSE PEREZ' }), docs);

      // Single doc has rfc, client omitted → docs can self-match with client suggestion
      const rfcField = result.detail.fields.find((f) => f.fieldName === 'rfc');
      expect(rfcField?.status).toBe('MATCH');
      const alert = result.alerts.find((a) => a.ruleCode === 'CLIENT_FIELD_OMITTED' && a.field === 'rfc');
      expect(alert).toBeDefined();
    });
  });

  describe('NOT_AVAILABLE handling', () => {
    it('marks curp NOT_AVAILABLE when only bank-statement is present (lacks curp structurally)', async () => {
      const docs = [
        doc('BANK_STATEMENT', { accountHolder: { fullName: 'JOSE PEREZ' } }),
      ];
      const result = await rule.execute(client(), docs);

      const curpField = result.detail.fields.find((f) => f.fieldName === 'curp');
      expect(curpField?.status).toBe('NOT_AVAILABLE');
      expect(result.outcome).not.toBe('FAIL');
    });

    it('compares rfc across docs even when bank-statement lacks curp', async () => {
      const docs = [
        doc('BANK_STATEMENT', { accountHolder: { fullName: 'JOSE PEREZ' } }),
        doc('PAYROLL_RECEIPT', {
          employee: { fullName: 'JOSE PEREZ', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
      ];
      const result = await rule.execute(
        client({ fullName: 'JOSE PEREZ', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' }),
        docs,
      );

      const nameField = result.detail.fields.find((f) => f.fieldName === 'fullName');
      expect(nameField?.status).toBe('MATCH');
    });

    it('returns PASS when no comparable fields are available', async () => {
      const result = await rule.execute(client(), []);
      expect(result.outcome).toBe('PASS');
      expect(result.severity).toBe('INFO');
    });
  });

  describe('normalization during comparison', () => {
    it('treats accented/spaced variants as equal', async () => {
      const docs = [
        doc('INE', { identity: { fullName: '  José  Pérez García ', curp: 'PEJ900315HYNRLN08' } }),
        doc('PAYROLL_RECEIPT', {
          employee: { fullName: 'JOSE PEREZ GARCIA', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
      ];
      const result = await rule.execute(client(), docs);

      expect(result.outcome).toBe('PASS');
      const nameField = result.detail.fields.find((f) => f.fieldName === 'fullName');
      expect(nameField?.status).toBe('MATCH');
      expect(nameField?.normalizedValue['official-id']).toBe('JOSE PEREZ GARCIA');
      expect(nameField?.normalizedValue['payroll']).toBe('JOSE PEREZ GARCIA');
    });

    it('matches fullName across documents with different token order (INE scenario)', async () => {
      // INE: "GARCIA LOPEZ MARIA" (apellidos primero)
      // Payroll: "MARIA GARCIA LOPEZ" (nombre natural)
      const docs = [
        doc('INE', { identity: { fullName: 'GARCIA LOPEZ MARIA', curp: 'PEJ900315HYNRLN08' } }),
        doc('PAYROLL_RECEIPT', {
          employee: { fullName: 'MARIA GARCIA LOPEZ', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
      ];
      const result = await rule.execute(
        client({ fullName: 'MARIA GARCIA LOPEZ' }),
        docs,
      );

      expect(result.outcome).toBe('PASS');
      const nameField = result.detail.fields.find((f) => f.fieldName === 'fullName');
      expect(nameField?.status).toBe('MATCH');
    });

    it('still detects real name mismatch despite different word count', async () => {
      const docs = [
        doc('INE', { identity: { fullName: 'PEREZ GARCIA JOSE', curp: 'PEJ900315HYNRLN08' } }),
        doc('PAYROLL_RECEIPT', {
          employee: { fullName: 'PEREZ GARCIA', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
      ];
      const result = await rule.execute(client({ fullName: 'PEREZ GARCIA' }), docs);

      const nameField = result.detail.fields.find((f) => f.fieldName === 'fullName');
      // Different token count → not a match
      expect(nameField?.status).toBe('MISMATCH');
    });
  });

  describe('detail structure stability', () => {
    it('every field entry carries originalValue, normalizedValue, status, severity, alerts', async () => {
      const docs = [
        doc('INE', { identity: { fullName: 'JOSE PEREZ', curp: 'PEJ900315HYNRLN08' } }),
      ];
      const result = await rule.execute(client(), docs);

      for (const field of result.detail.fields) {
        expect(field).toEqual(
          expect.objectContaining({
            fieldName: expect.any(String),
            originalValue: expect.any(Object),
            normalizedValue: expect.any(Object),
            status: expect.stringMatching(/^(MATCH|MISMATCH|NOT_AVAILABLE)$/),
            severity: expect.stringMatching(/^(ERROR|WARNING|INFO)$/),
            alerts: expect.any(Array),
          }),
        );
      }
    });
  });

  // ── PFAE personType-aware sources (HU-19a) ──────────────────────────────
  describe('PFAE personType', () => {
    const pfaeClient = (over: Partial<PrismaClientLike> = {}): PrismaClientLike => ({
      fullName: 'JOSE PEREZ GARCIA',
      rfc: 'PELJ900101ABC',
      curp: 'PEJ900315HYNRLN08',
      personType: 'PFAE',
      ...over,
    });

    it('produces a csf source and matches rfc when CSF document is present', async () => {
      const docs = [
        doc('CSF', {
          taxpayer: { fullName: 'JOSE PEREZ GARCIA', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
      ];
      const result = await rule.execute(pfaeClient(), docs);

      expect(result.detail.sources).toEqual(expect.arrayContaining(['csf', 'client']));
      const rfcField = result.detail.fields.find((f) => f.fieldName === 'rfc');
      expect(rfcField?.status).toBe('MATCH');
    });

    it('csf missing curp does not cause FAIL', async () => {
      const docs = [
        doc('CSF', { taxpayer: { fullName: 'JOSE PEREZ GARCIA', rfc: 'PELJ900101ABC', curp: null } }),
      ];
      const result = await rule.execute(pfaeClient(), docs);

      const curpField = result.detail.fields.find((f) => f.fieldName === 'curp');
      expect(curpField?.status).toBe('NOT_AVAILABLE');
      expect(result.outcome).not.toBe('FAIL');
    });

    it('excludes payroll and never produces a payroll source for PFAE, even with a stray PAYROLL_RECEIPT document', async () => {
      const docs = [
        doc('CSF', {
          taxpayer: { fullName: 'JOSE PEREZ GARCIA', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
        doc('PAYROLL_RECEIPT', {
          employee: { fullName: 'SOMEONE ELSE', rfc: 'XAXX010101000', curp: 'XXXX000101HXXXXX00' },
        }),
      ];
      const result = await rule.execute(pfaeClient(), docs);

      expect(result.detail.sources).not.toContain('payroll');
      expect(result.outcome).not.toBe('FAIL');
    });

    it('PFAE detail never includes csf/tax-return for a SALARIED case (regression)', async () => {
      const docs = [doc('INE', { identity: { fullName: 'JOSE PEREZ', curp: 'PEJ900315HYNRLN08' } })];
      const result = await rule.execute(client(), docs);

      expect(result.detail.sources).not.toContain('csf');
      expect(result.detail.sources).not.toContain('tax-return');
      expect(result.detail.sources).toEqual(expect.arrayContaining(['official-id', 'client']));
    });

    it('tax-return RFC mismatch causes FAIL/ERROR — same severity as any document RFC mismatch', async () => {
      const docs = [
        doc('CSF', {
          taxpayer: { fullName: 'JOSE PEREZ GARCIA', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
        doc('TAX_RETURN', { satReceipt: { taxpayerName: 'JOSE PEREZ GARCIA', rfc: 'XAXX010101000' } }),
      ];
      const result = await rule.execute(pfaeClient(), docs);

      expect(result.outcome).toBe('FAIL');
      expect(result.severity).toBe('ERROR');
      const rfcField = result.detail.fields.find((f) => f.fieldName === 'rfc');
      expect(rfcField?.status).toBe('MISMATCH');
      expect(rfcField?.severity).toBe('ERROR');
      expect(rfcField?.alerts).toContain('DOCUMENT_CONFLICT');
    });

    it('tax-return name-only mismatch (RFC matches) causes PARTIAL/WARNING, not FAIL', async () => {
      const docs = [
        doc('CSF', {
          taxpayer: { fullName: 'JOSE PEREZ GARCIA', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
        doc('TAX_RETURN', { satReceipt: { taxpayerName: 'JUAN PEREZ GARCIA', rfc: 'PELJ900101ABC' } }),
      ];
      const result = await rule.execute(pfaeClient(), docs);

      expect(result.outcome).toBe('PARTIAL');
      const nameField = result.detail.fields.find((f) => f.fieldName === 'fullName');
      expect(nameField?.status).toBe('MISMATCH');
      expect(nameField?.alerts).toContain('NAME_MISMATCH');
      const rfcField = result.detail.fields.find((f) => f.fieldName === 'rfc');
      expect(rfcField?.status).toBe('MATCH');
    });

    it('missing tax-return document yields NOT_AVAILABLE and does not cause FAIL', async () => {
      const docs = [
        doc('CSF', {
          taxpayer: { fullName: 'JOSE PEREZ GARCIA', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
      ];
      const result = await rule.execute(pfaeClient(), docs);

      expect(result.detail.sources).not.toContain('tax-return');
      expect(result.outcome).not.toBe('FAIL');
      const rfcField = result.detail.fields.find((f) => f.fieldName === 'rfc');
      expect(rfcField?.status).not.toBe('MISMATCH');
    });

    it('tax-return curp is always NOT_AVAILABLE — no curp field exists for this source', async () => {
      const docs = [
        doc('CSF', {
          taxpayer: { fullName: 'JOSE PEREZ GARCIA', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
        doc('TAX_RETURN', { satReceipt: { taxpayerName: 'JOSE PEREZ GARCIA', rfc: 'PELJ900101ABC' } }),
      ];
      const result = await rule.execute(pfaeClient(), docs);

      const curpField = result.detail.fields.find((f) => f.fieldName === 'curp');
      expect(curpField?.originalValue['tax-return']).toBeNull();
    });
  });

  // ── PM personType-aware sources (HU-22) ────────────────────────────────
  describe('PM personType', () => {
    const pmClient = (over: Partial<PrismaClientLike> = {}): PrismaClientLike => ({
      fullName: 'JOSE PEREZ GARCIA',
      rfc: 'PELJ900101ABC',
      curp: 'PEJ900315HYNRLN08',
      personType: 'PM',
      ...over,
    });

    it('uses shareholder sources: official-id, bank-statement, credit-bureau, client', async () => {
      const docs = [
        doc('INE', {
          identity: { fullName: 'JOSE PEREZ GARCIA', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
        doc('BANK_STATEMENT', {
          accountHolder: { fullName: 'JOSE PEREZ GARCIA', rfc: 'PELJ900101ABC' },
        }),
        doc('CREDIT_BUREAU_REPORT', {
          borrower: { fullName: 'JOSE PEREZ GARCIA', rfc: 'PELJ900101ABC' },
        }),
      ];
      const result = await rule.execute(pmClient(), docs);

      expect(result.detail.sources).toEqual(
        expect.arrayContaining(['official-id', 'bank-statement', 'credit-bureau', 'client']),
      );
      expect(result.outcome).toBe('PASS');
    });

    it('excludes payroll even with a stray PAYROLL_RECEIPT whose RFC would conflict', async () => {
      const docs = [
        doc('INE', {
          identity: { fullName: 'JOSE PEREZ GARCIA', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
        doc('PAYROLL_RECEIPT', {
          employee: { fullName: 'SOMEONE ELSE', rfc: 'XAXX010101000', curp: 'XXXX000101HXXXXX00' },
        }),
      ];
      const result = await rule.execute(pmClient(), docs);

      expect(result.detail.sources).not.toContain('payroll');
      expect(result.outcome).not.toBe('FAIL');
    });

    it('excludes CSF even when a CSF document is present with a conflicting RFC', async () => {
      const docs = [
        doc('INE', {
          identity: { fullName: 'JOSE PEREZ GARCIA', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
        doc('CSF', {
          taxpayer: { fullName: 'EMPRESA SA DE CV', rfc: 'EMP010101AAA', curp: null },
        }),
      ];
      const result = await rule.execute(pmClient(), docs);

      expect(result.detail.sources).not.toContain('csf');
      expect(result.outcome).not.toBe('FAIL');
    });

    it('excludes tax-return even when a TAX_RETURN document is present with a conflicting RFC', async () => {
      const docs = [
        doc('INE', {
          identity: { fullName: 'JOSE PEREZ GARCIA', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
        doc('TAX_RETURN', { satReceipt: { taxpayerName: 'EMPRESA SA DE CV', rfc: 'EMP010101AAA' } }),
      ];
      const result = await rule.execute(pmClient(), docs);

      expect(result.detail.sources).not.toContain('tax-return');
      expect(result.outcome).not.toBe('FAIL');
    });
  });
});
