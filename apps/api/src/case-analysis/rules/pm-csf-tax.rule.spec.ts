import { PmCsfTaxRule } from './pm-csf-tax.rule';

describe('PmCsfTaxRule', () => {
  const rule = new PmCsfTaxRule();

  const shareholderRegime = {
    description: 'Régimen de los ingresos por dividendos (socios y accionistas)',
    startDate: '2018-01-01',
    endDate: null,
  };
  const salariedRegime = {
    description: 'Régimen de Sueldos y Salarios e Ingresos Asimilados a Salarios',
    startDate: '2015-01-01',
    endDate: null,
  };

  function csf(regimes: unknown[], owner: string | null = 'SHAREHOLDER') {
    return {
      owner,
      documentType: { code: 'CSF' },
      extractedData: { regimes },
    };
  }

  function companyReturn(extractedData: Record<string, unknown>) {
    return {
      owner: 'COMPANY',
      documentType: { code: 'TAX_RETURN' },
      extractedData,
    };
  }

  it('ignores cases that are not Persona Moral', async () => {
    const result = await rule.execute({ personType: 'PFAE' }, [
      csf([salariedRegime]),
    ]);
    expect(result.outcome).toBe('PASS');
    expect(result.alerts).toEqual([]);
  });

  it('accepts a shareholder CSF that mixes sueldos with socio o accionista', async () => {
    const result = await rule.execute({ personType: 'PM' }, [
      csf([salariedRegime, shareholderRegime]),
    ]);
    expect(result.outcome).toBe('PASS');
    expect(result.alerts).toEqual([]);
    expect(result.detail.declarationPathKnockedOut).toBe(false);
  });

  it('treats a CSF with no owner as the shareholder CSF', async () => {
    const result = await rule.execute({ personType: 'PM' }, [
      csf([shareholderRegime], null),
    ]);
    expect(result.outcome).toBe('PASS');
  });

  it('fails the PM path when the shareholder CSF has only sueldos y salarios', async () => {
    const result = await rule.execute({ personType: 'PM' }, [
      csf([salariedRegime]),
      csf([shareholderRegime], 'COMPANY'),
    ]);
    expect(result.outcome).toBe('FAIL');
    expect(result.alerts.map((alert) => alert.ruleCode)).toEqual([
      'PM_CSF_SIN_REGIMEN_SOCIO',
    ]);
  });

  it('ignores a closed shareholder regime', async () => {
    const result = await rule.execute({ personType: 'PM' }, [
      csf([{ ...shareholderRegime, endDate: '2020-01-01' }, salariedRegime]),
    ]);
    expect(result.outcome).toBe('FAIL');
  });

  it('warns when the shareholder CSF has not been extracted', async () => {
    const result = await rule.execute({ personType: 'PM' }, []);
    expect(result.outcome).toBe('PARTIAL');
    expect(result.alerts[0]?.ruleCode).toBe('PM_CSF_MISSING');
  });

  it('knocks out only the declaration path when the company return has a fiscal loss', async () => {
    const result = await rule.execute({ personType: 'PM' }, [
      csf([shareholderRegime]),
      companyReturn({
        hasTaxLoss: true,
        fiscalResult: { fiscalLoss: 12000, taxResult: -12000 },
      }),
      {
        owner: 'SHAREHOLDER',
        documentType: { code: 'TAX_RETURN' },
        extractedData: { hasTaxLoss: true, fiscalResult: { fiscalLoss: 500 } },
      },
    ]);
    expect(result.outcome).toBe('PARTIAL');
    expect(result.detail.declarationPathKnockedOut).toBe(true);
    expect(result.alerts.map((alert) => alert.ruleCode)).toEqual([
      'PERDIDA_FISCAL_KNOCKOUT_DECLARACION',
    ]);
    expect(result.alerts[0]?.severity).toBe('WARNING');
  });

  it('keeps the declaration path when only the shareholder return has a loss', async () => {
    const result = await rule.execute({ personType: 'PM' }, [
      csf([shareholderRegime]),
      {
        owner: 'SHAREHOLDER',
        documentType: { code: 'TAX_RETURN' },
        extractedData: { hasTaxLoss: true },
      },
    ]);
    expect(result.outcome).toBe('PASS');
    expect(result.detail.declarationPathKnockedOut).toBe(false);
  });
});
