import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateBankDto } from './update-bank.dto';
import { IncomeCriterion } from '../../generated/prisma/client';

describe('UpdateBankDto', () => {
  describe('name', () => {
    it('should accept valid string name', async () => {
      const dto = plainToInstance(UpdateBankDto, { name: 'Banorte' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject non-string name', async () => {
      const dto = plainToInstance(UpdateBankDto, { name: 123 });
      const errors = await validate(dto);
      const nameErrors = errors.filter((e) => e.property === 'name');
      expect(nameErrors.length).toBeGreaterThan(0);
    });
  });

  describe('incomeCriterion', () => {
    it('should accept GROSS', async () => {
      const dto = plainToInstance(UpdateBankDto, {
        incomeCriterion: IncomeCriterion.GROSS,
      });
      const errors = await validate(dto);
      const criterionErrors = errors.filter(
        (e) => e.property === 'incomeCriterion',
      );
      expect(criterionErrors).toHaveLength(0);
    });

    it('should accept NET', async () => {
      const dto = plainToInstance(UpdateBankDto, {
        incomeCriterion: IncomeCriterion.NET,
      });
      const errors = await validate(dto);
      const criterionErrors = errors.filter(
        (e) => e.property === 'incomeCriterion',
      );
      expect(criterionErrors).toHaveLength(0);
    });

    it('should reject invalid enum value', async () => {
      const dto = plainToInstance(UpdateBankDto, {
        incomeCriterion: 'INVALID',
      });
      const errors = await validate(dto);
      const criterionErrors = errors.filter(
        (e) => e.property === 'incomeCriterion',
      );
      expect(criterionErrors.length).toBeGreaterThan(0);
    });
  });

  describe('debtCommitmentFactor', () => {
    it('should accept valid factor between 0 and 1', async () => {
      const dto = plainToInstance(UpdateBankDto, {
        debtCommitmentFactor: 0.55,
      });
      const errors = await validate(dto);
      const factorErrors = errors.filter(
        (e) => e.property === 'debtCommitmentFactor',
      );
      expect(factorErrors).toHaveLength(0);
    });

    it('should accept boundary value 0', async () => {
      const dto = plainToInstance(UpdateBankDto, {
        debtCommitmentFactor: 0,
      });
      const errors = await validate(dto);
      const factorErrors = errors.filter(
        (e) => e.property === 'debtCommitmentFactor',
      );
      expect(factorErrors).toHaveLength(0);
    });

    it('should accept boundary value 1', async () => {
      const dto = plainToInstance(UpdateBankDto, {
        debtCommitmentFactor: 1,
      });
      const errors = await validate(dto);
      const factorErrors = errors.filter(
        (e) => e.property === 'debtCommitmentFactor',
      );
      expect(factorErrors).toHaveLength(0);
    });

    it('should reject factor greater than 1', async () => {
      const dto = plainToInstance(UpdateBankDto, {
        debtCommitmentFactor: 1.5,
      });
      const errors = await validate(dto);
      const factorErrors = errors.filter(
        (e) => e.property === 'debtCommitmentFactor',
      );
      expect(factorErrors.length).toBeGreaterThan(0);
    });

    it('should reject negative factor', async () => {
      const dto = plainToInstance(UpdateBankDto, {
        debtCommitmentFactor: -0.1,
      });
      const errors = await validate(dto);
      const factorErrors = errors.filter(
        (e) => e.property === 'debtCommitmentFactor',
      );
      expect(factorErrors.length).toBeGreaterThan(0);
    });
  });

  describe('minimumBureauScore', () => {
    it('should accept valid integer score >= 300', async () => {
      const dto = plainToInstance(UpdateBankDto, {
        minimumBureauScore: 650,
      });
      const errors = await validate(dto);
      const bureauErrors = errors.filter(
        (e) => e.property === 'minimumBureauScore',
      );
      expect(bureauErrors).toHaveLength(0);
    });

    it('should accept boundary value 300', async () => {
      const dto = plainToInstance(UpdateBankDto, {
        minimumBureauScore: 300,
      });
      const errors = await validate(dto);
      const bureauErrors = errors.filter(
        (e) => e.property === 'minimumBureauScore',
      );
      expect(bureauErrors).toHaveLength(0);
    });

    it('should accept null value', async () => {
      const dto = plainToInstance(UpdateBankDto, {
        minimumBureauScore: null,
      });
      const errors = await validate(dto);
      const bureauErrors = errors.filter(
        (e) => e.property === 'minimumBureauScore',
      );
      expect(bureauErrors).toHaveLength(0);
    });

    it('should reject score below 300', async () => {
      const dto = plainToInstance(UpdateBankDto, {
        minimumBureauScore: 200,
      });
      const errors = await validate(dto);
      const bureauErrors = errors.filter(
        (e) => e.property === 'minimumBureauScore',
      );
      expect(bureauErrors.length).toBeGreaterThan(0);
    });

    it('should reject non-integer score', async () => {
      const dto = plainToInstance(UpdateBankDto, {
        minimumBureauScore: 650.5,
      });
      const errors = await validate(dto);
      const bureauErrors = errors.filter(
        (e) => e.property === 'minimumBureauScore',
      );
      expect(bureauErrors.length).toBeGreaterThan(0);
    });
  });

  describe('isActive', () => {
    it('should accept boolean true', async () => {
      const dto = plainToInstance(UpdateBankDto, { isActive: true });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept boolean false', async () => {
      const dto = plainToInstance(UpdateBankDto, { isActive: false });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject non-boolean value', async () => {
      const dto = plainToInstance(UpdateBankDto, { isActive: 'yes' });
      const errors = await validate(dto);
      const activeErrors = errors.filter((e) => e.property === 'isActive');
      expect(activeErrors.length).toBeGreaterThan(0);
    });
  });

  describe('empty DTO', () => {
    it('should accept empty object (all fields optional)', async () => {
      const dto = plainToInstance(UpdateBankDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('PFAE factor card (HU-20)', () => {
    it('should accept PATCH card FLAT 0.6', async () => {
      const dto = plainToInstance(UpdateBankDto, {
        pfaeFactorMode: 'FLAT',
        pfaeFlatFactor: 0.6,
      });
      const errors = await validate(dto);
      const modeErrors = errors.filter((e) => e.property === 'pfaeFactorMode');
      const factorErrors = errors.filter((e) => e.property === 'pfaeFlatFactor');
      expect(modeErrors).toHaveLength(0);
      expect(factorErrors).toHaveLength(0);
      expect(dto.pfaeFactorMode).toBe('FLAT');
      expect(dto.pfaeFlatFactor).toBe(0.6);
    });

    it('should reject invalid pfaeFactorMode', async () => {
      const dto = plainToInstance(UpdateBankDto, {
        pfaeFactorMode: 'INVALID',
      });
      const errors = await validate(dto);
      const modeErrors = errors.filter((e) => e.property === 'pfaeFactorMode');
      expect(modeErrors.length).toBeGreaterThan(0);
    });

    it('should accept NONE and REJECTED taxReturnPolicy', async () => {
      const dto = plainToInstance(UpdateBankDto, {
        pfaeFactorMode: 'NONE',
        taxReturnPolicy: 'REJECTED',
      });
      const errors = await validate(dto);
      const modeErrors = errors.filter((e) => e.property === 'pfaeFactorMode');
      const taxErrors = errors.filter((e) => e.property === 'taxReturnPolicy');
      expect(modeErrors).toHaveLength(0);
      expect(taxErrors).toHaveLength(0);
    });

    it('should reject invalid taxReturnPolicy', async () => {
      const dto = plainToInstance(UpdateBankDto, {
        taxReturnPolicy: 'MAYBE',
      });
      const errors = await validate(dto);
      const taxErrors = errors.filter((e) => e.property === 'taxReturnPolicy');
      expect(taxErrors.length).toBeGreaterThan(0);
    });

    it('should accept pfaeFlatFactor 1.5 (no max, unlike debtCommitmentFactor)', async () => {
      const dto = plainToInstance(UpdateBankDto, {
        pfaeFlatFactor: 1.5,
      });
      const errors = await validate(dto);
      const factorErrors = errors.filter((e) => e.property === 'pfaeFlatFactor');
      expect(factorErrors).toHaveLength(0);
    });

    it('should reject negative pfaeFlatFactor', async () => {
      const dto = plainToInstance(UpdateBankDto, {
        pfaeFlatFactor: -0.1,
      });
      const errors = await validate(dto);
      const factorErrors = errors.filter((e) => e.property === 'pfaeFlatFactor');
      expect(factorErrors.length).toBeGreaterThan(0);
    });
  });
});
