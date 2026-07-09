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
    it('returns PASS when official-id, payroll and client agree on rfc/curp/name', async () => {
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

  describe('RFC mismatch between documents', () => {
    it('returns FAIL with IDENTITY_MISMATCH alert when official-id and payroll rfc differ', async () => {
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
      expect(rfcField?.alerts).toContain('IDENTITY_MISMATCH');
      const alert = result.alerts.find((a) => a.ruleCode === 'IDENTITY_MISMATCH');
      expect(alert).toBeDefined();
      expect(alert?.severity).toBe('ERROR');
      expect(alert?.field).toBe('rfc');
    });

    it('returns FAIL when CURP mismatches between official-id and payroll', async () => {
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
      expect(curpField?.alerts).toContain('IDENTITY_MISMATCH');
    });
  });

  describe('name-only mismatch (RFC/CURP match)', () => {
    it('returns PARTIAL with WARNING when fullName differs but RFC matches across sources', async () => {
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

  describe('Client as operational reference', () => {
    it('returns PARTIAL when all documents agree on rfc but client rfc differs', async () => {
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
      expect(rfcField?.alerts).toContain('CLIENT_DOCUMENT_MISMATCH');
      // RFC doc-doc consensus exists, so no IDENTITY_MISMATCH
      expect(rfcField?.alerts).not.toContain('IDENTITY_MISMATCH');
    });

    it('does not auto-cancel (alert severity is WARNING, not ERROR)', async () => {
      const docs = [
        doc('INE', { identity: { fullName: 'JOSE PEREZ', curp: 'PEJ900315HYNRLN08' } }),
        doc('PAYROLL_RECEIPT', {
          employee: { fullName: 'JOSE PEREZ', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
      ];
      const result = await rule.execute(client({ rfc: 'XAXX010101000' }), docs);

      const clientAlert = result.alerts.find((a) => a.ruleCode === 'CLIENT_DOCUMENT_MISMATCH');
      expect(clientAlert?.severity).toBe('WARNING');
      expect(result.outcome).toBe('PARTIAL');
    });
  });

  describe('NOT_AVAILABLE handling', () => {
    it('marks curp NOT_AVAILABLE when bank-statement is the only curp candidate', async () => {
      // Only a bank-statement present: it structurally lacks curp → curp has <2 doc sources.
      const docs = [
        doc('BANK_STATEMENT', { accountHolder: { fullName: 'JOSE PEREZ' } }),
      ];
      const result = await rule.execute(client(), docs);

      const curpField = result.detail.fields.find((f) => f.fieldName === 'curp');
      expect(curpField?.status).toBe('NOT_AVAILABLE');
      // Absent field must not cause FAIL.
      expect(result.outcome).not.toBe('FAIL');
    });

    it('still compares rfc across documents even when bank-statement lacks curp', async () => {
      const docs = [
        doc('BANK_STATEMENT', { accountHolder: { fullName: 'JOSE PEREZ' } }),
        doc('PAYROLL_RECEIPT', {
          employee: { fullName: 'JOSE PEREZ', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
      ];
      // Client matches the documents so cross-source comparison is clean (PASS).
      const result = await rule.execute(
        client({ fullName: 'JOSE PEREZ', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' }),
        docs,
      );

      // fullName comparable across bank-statement + payroll → docs agree → MATCH
      const nameField = result.detail.fields.find((f) => f.fieldName === 'fullName');
      expect(nameField?.status).toBe('MATCH');
      // rfc: only payroll carries it among documents (bank-statement lacks rfc),
      // so doc-doc consensus is just payroll; client also matches → MATCH.
      const rfcField = result.detail.fields.find((f) => f.fieldName === 'rfc');
      expect(rfcField?.status).toBe('MATCH');
    });

    it('returns PASS when no comparable fields are available', async () => {
      // No documents at all → PASS / INFO.
      const result = await rule.execute(client(), []);

      expect(result.outcome).toBe('PASS');
      expect(result.severity).toBe('INFO');
    });
  });

  describe('normalization during comparison', () => {
    it('treats accented/spaced variants as equal', async () => {
      const docs = [
        // Spacing/accent variants that normalize identically. Note: per the
        // spec, '-' is *removed* (not replaced with space), so 'PÉREZ-GARCÍA'
        // → 'PEREZGARCIA'. Use a space-free form in both sources to get MATCH.
        doc('INE', { identity: { fullName: '  José  Pérez García ', curp: 'PEJ900315HYNRLN08' } }),
        doc('PAYROLL_RECEIPT', {
          employee: { fullName: 'JOSE PEREZ GARCIA', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        }),
      ];
      const result = await rule.execute(client(), docs);

      expect(result.outcome).toBe('PASS');
      const nameField = result.detail.fields.find((f) => f.fieldName === 'fullName');
      expect(nameField?.status).toBe('MATCH');
      // Normalized values captured per source
      expect(nameField?.normalizedValue['official-id']).toBe('JOSE PEREZ GARCIA');
      expect(nameField?.normalizedValue['payroll']).toBe('JOSE PEREZ GARCIA');
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
});