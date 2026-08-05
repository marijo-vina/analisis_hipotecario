import { BANKS, BANK_POLICIES, CREDIT_TYPES, SOURCE_VERSION } from '../prisma/seed-data';

describe('Seed Data — Catálogo Bancario CMA', () => {
  describe('SOURCE_VERSION', () => {
    it('should be ANAQUEL_AGOSTO_2026', () => {
      expect(SOURCE_VERSION).toBe('ANAQUEL_AGOSTO_2026');
    });
  });

  describe('BANKS (9 banks with CMA fields)', () => {
    it('should have exactly 9 banks', () => {
      expect(BANKS).toHaveLength(9);
    });

    it('should include all expected bank codes', () => {
      const codes = BANKS.map((b) => b.code);
      expect(codes).toEqual(
        expect.arrayContaining([
          'BANORTE',
          'SCOTIABANK',
          'SANTANDER',
          'HSBC',
          'CITIBANAMEX',
          'BXPLUS',
          'MIFEL',
          'BANREGIO',
          'AFIRME',
        ]),
      );
    });

    it('should have Banorte with NET criterion, 0.60 factor, no bureau score', () => {
      const banorte = BANKS.find((b) => b.code === 'BANORTE');
      expect(banorte).toBeDefined();
      expect(banorte!.name).toBe('Banorte');
      expect(banorte!.debtCommitmentFactor).toBe(0.6);
      expect(banorte!.incomeCriterion).toBe('NET');
      expect(banorte!.minimumBureauScore).toBeNull();
    });

    it('should have Santander with minimumBureauScore=541', () => {
      const santander = BANKS.find((b) => b.code === 'SANTANDER');
      expect(santander).toBeDefined();
      expect(santander!.minimumBureauScore).toBe(541);
      expect(santander!.incomeCriterion).toBe('NET');
      expect(santander!.debtCommitmentFactor).toBe(0.5);
    });

    it('should have Banregio with minimumBureauScore=629', () => {
      const banregio = BANKS.find((b) => b.code === 'BANREGIO');
      expect(banregio).toBeDefined();
      expect(banregio!.name).toBe('Banregio');
      expect(banregio!.minimumBureauScore).toBe(629);
      expect(banregio!.incomeCriterion).toBe('GROSS');
      expect(banregio!.debtCommitmentFactor).toBe(0.5);
    });

    it('should have Scotiabank with GROSS criterion and 0.55 factor', () => {
      const scotia = BANKS.find((b) => b.code === 'SCOTIABANK');
      expect(scotia).toBeDefined();
      expect(scotia!.incomeCriterion).toBe('GROSS');
      expect(scotia!.debtCommitmentFactor).toBe(0.55);
      expect(scotia!.minimumBureauScore).toBeNull();
    });

    it('should have Afirme with NET-like GROSS criterion and 0.60 factor', () => {
      const afirme = BANKS.find((b) => b.code === 'AFIRME');
      expect(afirme).toBeDefined();
      expect(afirme!.name).toBe('Afirme');
      expect(afirme!.incomeCriterion).toBe('GROSS');
      expect(afirme!.debtCommitmentFactor).toBe(0.6);
      expect(afirme!.minimumBureauScore).toBeNull();
    });

    it('should have BX+ as BXPLUS display name', () => {
      const bxplus = BANKS.find((b) => b.code === 'BXPLUS');
      expect(bxplus).toBeDefined();
      expect(bxplus!.name).toBe('BX+');
    });

    it('should have all other banks with correct factor and no bureau score', () => {
      const noBureau = BANKS.filter((b) => b.minimumBureauScore === null);
      expect(noBureau).toHaveLength(7);
    });
  });

  describe('CREDIT_TYPES (all 6 with destinations)', () => {
    it('should have exactly 6 credit types', () => {
      expect(CREDIT_TYPES).toHaveLength(6);
    });

    it('should have all credit types with non-null destination', () => {
      for (const ct of CREDIT_TYPES) {
        expect(ct.destination).not.toBeNull();
      }
    });

    it('should map COMPRA → ACQUISITION', () => {
      const compra = CREDIT_TYPES.find((ct) => ct.code === 'COMPRA');
      expect(compra!.destination).toBe('ACQUISITION');
    });

    it('should map MEJORA_HIPOTECA → MORTGAGE_REPLACEMENT', () => {
      const mejora = CREDIT_TYPES.find((ct) => ct.code === 'MEJORA_HIPOTECA');
      expect(mejora!.destination).toBe('MORTGAGE_REPLACEMENT');
    });

    it('should map LIQUIDEZ → LIQUIDITY', () => {
      const liq = CREDIT_TYPES.find((ct) => ct.code === 'LIQUIDEZ');
      expect(liq!.destination).toBe('LIQUIDITY');
    });

    it('should map TERRENO → TERRENO', () => {
      const terreno = CREDIT_TYPES.find((ct) => ct.code === 'TERRENO');
      expect(terreno!.destination).toBe('TERRENO');
    });

    it('should map REMODELACION → REMODELACION', () => {
      const rem = CREDIT_TYPES.find((ct) => ct.code === 'REMODELACION');
      expect(rem!.destination).toBe('REMODELACION');
    });

    it('should map CONSTRUCCION → CONSTRUCCION', () => {
      const cons = CREDIT_TYPES.find((ct) => ct.code === 'CONSTRUCCION');
      expect(cons!.destination).toBe('CONSTRUCCION');
    });
  });

  describe('BANK_POLICIES (CMA policies per bank and destination)', () => {
    it('should have policies for all expected banks', () => {
      const bankCodes = [...new Set(BANK_POLICIES.map((p) => p.bankCode))];
      expect(bankCodes).toEqual(
        expect.arrayContaining(['BANORTE', 'SCOTIABANK', 'SANTANDER', 'HSBC', 'CITIBANAMEX', 'MIFEL', 'BANREGIO']),
      );
    });

    it('should NOT have policies for BXPLUS and AFIRME (bank-level only)', () => {
      const bxplus = BANK_POLICIES.filter((p) => p.bankCode === 'BXPLUS');
      const afirme = BANK_POLICIES.filter((p) => p.bankCode === 'AFIRME');
      expect(bxplus).toHaveLength(0);
      expect(afirme).toHaveLength(0);
    });

    describe('BANORTE (NET, 6 destinations, all active)', () => {
      const policies = BANK_POLICIES.filter((p) => p.bankCode === 'BANORTE');

      it('should have 6 active policies', () => {
        expect(policies).toHaveLength(6);
        expect(policies.every((p) => p.isActive)).toBe(true);
      });

      it('should cover all 6 destinations', () => {
        const destinations = policies.map((p) => p.destination).sort();
        expect(destinations).toEqual(
          ['ACQUISITION', 'CONSTRUCCION', 'LIQUIDITY', 'MORTGAGE_REPLACEMENT', 'REMODELACION', 'TERRENO'].sort(),
        );
      });

      it('should have minPropertyValue=350000 for ACQUISITION', () => {
        const adq = policies.find((p) => p.destination === 'ACQUISITION');
        expect(adq).toBeDefined();
        expect(adq!.minimumPropertyValue).toBe(350000);
        expect(adq!.minimumIncome).toBeNull();
      });

      it('should have tenure=12 for all policies', () => {
        expect(policies.every((p) => p.minimumEmploymentTenureMonths === 12)).toBe(true);
      });

      it('should have age range 300-839 months for all policies', () => {
        expect(policies.every((p) => p.minimumApplicantAgeMonths === 300)).toBe(true);
        expect(policies.every((p) => p.maximumApplicationAgeMonths === 839)).toBe(true);
      });

      it('should use code format BANORTE_{shortDest}', () => {
        const adq = policies.find((p) => p.destination === 'ACQUISITION');
        expect(adq!.code).toBe('BANORTE_ADQ');
        const ter = policies.find((p) => p.destination === 'TERRENO');
        expect(ter!.code).toBe('BANORTE_TER');
      });
    });

    describe('SCOTIABANK (GROSS, 5 destinations — no TERRENO)', () => {
      const policies = BANK_POLICIES.filter((p) => p.bankCode === 'SCOTIABANK');

      it('should have 5 active policies (no TERRENO)', () => {
        expect(policies).toHaveLength(5);
        const destinations = policies.map((p) => p.destination);
        expect(destinations).not.toContain('TERRENO');
      });

      it('should have minIncome=10000 for all active policies', () => {
        expect(policies.every((p) => p.minimumIncome === 10000)).toBe(true);
      });

      it('should have ACQUISITION with minPropertyValue=400000', () => {
        const adq = policies.find((p) => p.destination === 'ACQUISITION');
        expect(adq!.minimumPropertyValue).toBe(400000);
      });

      it('should have LIQUIDITY with null minPropertyValue', () => {
        const liq = policies.find((p) => p.destination === 'LIQUIDITY');
        expect(liq!.minimumPropertyValue).toBeNull();
      });

      it('should have tenure=6 and age range 300-888', () => {
        expect(policies.every((p) => p.minimumEmploymentTenureMonths === 6)).toBe(true);
        expect(policies.every((p) => p.minimumApplicantAgeMonths === 300)).toBe(true);
        expect(policies.every((p) => p.maximumApplicationAgeMonths === 888)).toBe(true);
      });
    });

    describe('SANTANDER (NET, minBureauScore=542, 6 destinations)', () => {
      const policies = BANK_POLICIES.filter((p) => p.bankCode === 'SANTANDER');

      it('should have 6 active policies', () => {
        expect(policies).toHaveLength(6);
        expect(policies.every((p) => p.isActive)).toBe(true);
      });

      it('should have CONSTRUCCION with minIncome=20000 and minPropertyValue=700000', () => {
        const cons = policies.find((p) => p.destination === 'CONSTRUCCION');
        expect(cons).toBeDefined();
        expect(cons!.minimumIncome).toBe(20000);
        expect(cons!.minimumPropertyValue).toBe(700000);
      });

      it('should have ACQUISITION with minIncome=7500 and minPropertyValue=250000', () => {
        const adq = policies.find((p) => p.destination === 'ACQUISITION');
        expect(adq!.minimumIncome).toBe(7500);
        expect(adq!.minimumPropertyValue).toBe(250000);
      });

      it('should have LIQUIDITY with minIncome=7500 and null minPropertyValue', () => {
        const liq = policies.find((p) => p.destination === 'LIQUIDITY');
        expect(liq!.minimumIncome).toBe(7500);
        expect(liq!.minimumPropertyValue).toBeNull();
      });

      it('should have age range 252-960', () => {
        expect(policies.every((p) => p.minimumApplicantAgeMonths === 252)).toBe(true);
        expect(policies.every((p) => p.maximumApplicationAgeMonths === 960)).toBe(true);
      });

      it('should use code format SANTANDER_{shortDest}', () => {
        const cons = policies.find((p) => p.destination === 'CONSTRUCCION');
        expect(cons!.code).toBe('SANTANDER_CNS');
      });
    });

    describe('HSBC (NET, only ACQUISITION active)', () => {
      const policies = BANK_POLICIES.filter((p) => p.bankCode === 'HSBC');

      it('should have 3 policies total', () => {
        expect(policies).toHaveLength(3);
      });

      it('should have only ACQUISITION active', () => {
        const active = policies.filter((p) => p.isActive);
        expect(active).toHaveLength(1);
        expect(active[0].destination).toBe('ACQUISITION');
      });

      it('should have LIQUIDITY and MORTGAGE_REPLACEMENT inactive', () => {
        const liq = policies.find((p) => p.destination === 'LIQUIDITY');
        const mrtg = policies.find((p) => p.destination === 'MORTGAGE_REPLACEMENT');
        expect(liq!.isActive).toBe(false);
        expect(mrtg!.isActive).toBe(false);
      });

      it('should have ACQUISITION with null minIncome and null minPropertyValue', () => {
        const adq = policies.find((p) => p.destination === 'ACQUISITION' && p.isActive);
        expect(adq!.minimumIncome).toBeNull();
        expect(adq!.minimumPropertyValue).toBeNull();
      });

      it('should have age range 300-839', () => {
        const adq = policies.find((p) => p.isActive);
        expect(adq!.minimumApplicantAgeMonths).toBe(300);
        expect(adq!.maximumApplicationAgeMonths).toBe(839);
      });
    });

    describe('CITIBANAMEX (GROSS, 3 active — no TERRENO/CONSTRUCCION/REMODELACION)', () => {
      const policies = BANK_POLICIES.filter((p) => p.bankCode === 'CITIBANAMEX');

      it('should have 3 active policies', () => {
        expect(policies).toHaveLength(3);
        expect(policies.every((p) => p.isActive)).toBe(true);
      });

      it('should only have ACQUISITION, LIQUIDITY, MORTGAGE_REPLACEMENT', () => {
        const destinations = policies.map((p) => p.destination).sort();
        expect(destinations).toEqual(['ACQUISITION', 'LIQUIDITY', 'MORTGAGE_REPLACEMENT'].sort());
      });

      it('should have ACQUISITION with minIncome=15000 and minPropertyValue=750000', () => {
        const adq = policies.find((p) => p.destination === 'ACQUISITION');
        expect(adq!.minimumIncome).toBe(15000);
        expect(adq!.minimumPropertyValue).toBe(750000);
      });

      it('should have LIQUIDITY with minIncome=35000', () => {
        const liq = policies.find((p) => p.destination === 'LIQUIDITY');
        expect(liq!.minimumIncome).toBe(35000);
      });

      it('should have age range 276-899', () => {
        expect(policies.every((p) => p.minimumApplicantAgeMonths === 276)).toBe(true);
        expect(policies.every((p) => p.maximumApplicationAgeMonths === 899)).toBe(true);
      });

      it('should use code CITIBANAMEX_LIQ for LIQUIDITY', () => {
        const liq = policies.find((p) => p.destination === 'LIQUIDITY');
        expect(liq!.code).toBe('CITIBANAMEX_LIQ');
      });
    });

    describe('MIFEL (GROSS, 3 active + 3 inactive)', () => {
      const policies = BANK_POLICIES.filter((p) => p.bankCode === 'MIFEL');

      it('should have 6 policies total (3 active, 3 inactive)', () => {
        expect(policies).toHaveLength(6);
        const active = policies.filter((p) => p.isActive);
        const inactive = policies.filter((p) => !p.isActive);
        expect(active).toHaveLength(3);
        expect(inactive).toHaveLength(3);
      });

      it('should have ACQUISITION, LIQUIDITY, MORTGAGE_REPLACEMENT active', () => {
        const active = policies.filter((p) => p.isActive);
        const destinations = active.map((p) => p.destination).sort();
        expect(destinations).toEqual(['ACQUISITION', 'LIQUIDITY', 'MORTGAGE_REPLACEMENT'].sort());
      });

      it('should have null minIncome and null minPropertyValue for all active', () => {
        const active = policies.filter((p) => p.isActive);
        expect(active.every((p) => p.minimumIncome === null)).toBe(true);
        expect(active.every((p) => p.minimumPropertyValue === null)).toBe(true);
      });

      it('should have age range 252-960 and tenure=12', () => {
        expect(policies.every((p) => p.minimumApplicantAgeMonths === 252)).toBe(true);
        expect(policies.every((p) => p.maximumApplicationAgeMonths === 960)).toBe(true);
        expect(policies.every((p) => p.minimumEmploymentTenureMonths === 12)).toBe(true);
      });
    });

    describe('BANREGIO (GROSS, minBureauScore=629, 3 active + 3 inactive)', () => {
      const policies = BANK_POLICIES.filter((p) => p.bankCode === 'BANREGIO');

      it('should have 6 policies total (3 active, 3 inactive)', () => {
        expect(policies).toHaveLength(6);
        const active = policies.filter((p) => p.isActive);
        const inactive = policies.filter((p) => !p.isActive);
        expect(active).toHaveLength(3);
        expect(inactive).toHaveLength(3);
      });

      it('should have ACQUISITION, LIQUIDITY, MORTGAGE_REPLACEMENT active', () => {
        const active = policies.filter((p) => p.isActive);
        const destinations = active.map((p) => p.destination).sort();
        expect(destinations).toEqual(['ACQUISITION', 'LIQUIDITY', 'MORTGAGE_REPLACEMENT'].sort());
      });

      it('should have minIncome=17500 for all active policies', () => {
        const active = policies.filter((p) => p.isActive);
        expect(active.every((p) => p.minimumIncome === 17500)).toBe(true);
      });

      it('should have null minPropertyValue for all active policies', () => {
        const active = policies.filter((p) => p.isActive);
        expect(active.every((p) => p.minimumPropertyValue === null)).toBe(true);
      });

      it('should have tenure=24 and age range 264-912', () => {
        expect(policies.every((p) => p.minimumEmploymentTenureMonths === 24)).toBe(true);
        expect(policies.every((p) => p.minimumApplicantAgeMonths === 264)).toBe(true);
        expect(policies.every((p) => p.maximumApplicationAgeMonths === 912)).toBe(true);
      });
    });

    describe('Policy code format and names', () => {
      it('should use {bankCode}_{shortDest} format for all policies', () => {
        for (const p of BANK_POLICIES) {
          expect(p.code).toMatch(/^BANORTE_|SCOTIABANK_|SANTANDER_|HSBC_|CITIBANAMEX_|MIFEL_|BANREGIO_/);
        }
      });
    });
  });
});
