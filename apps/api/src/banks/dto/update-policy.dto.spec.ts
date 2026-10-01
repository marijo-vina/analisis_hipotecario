import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePolicyDto } from './update-policy.dto';

describe('UpdatePolicyDto', () => {
  describe('minimumIncome', () => {
    it('should accept valid positive number', async () => {
      const dto = plainToInstance(UpdatePolicyDto, { minimumIncome: 15000 });
      const errors = await validate(dto);
      const incomeErrors = errors.filter(
        (e) => e.property === 'minimumIncome',
      );
      expect(incomeErrors).toHaveLength(0);
    });

    it('should accept zero', async () => {
      const dto = plainToInstance(UpdatePolicyDto, { minimumIncome: 0 });
      const errors = await validate(dto);
      const incomeErrors = errors.filter(
        (e) => e.property === 'minimumIncome',
      );
      expect(incomeErrors).toHaveLength(0);
    });

    it('should accept null value', async () => {
      const dto = plainToInstance(UpdatePolicyDto, { minimumIncome: null });
      const errors = await validate(dto);
      const incomeErrors = errors.filter(
        (e) => e.property === 'minimumIncome',
      );
      expect(incomeErrors).toHaveLength(0);
    });

    it('should reject negative value', async () => {
      const dto = plainToInstance(UpdatePolicyDto, { minimumIncome: -100 });
      const errors = await validate(dto);
      const incomeErrors = errors.filter(
        (e) => e.property === 'minimumIncome',
      );
      expect(incomeErrors.length).toBeGreaterThan(0);
    });
  });

  describe('minimumPropertyValue', () => {
    it('should accept valid positive number', async () => {
      const dto = plainToInstance(UpdatePolicyDto, {
        minimumPropertyValue: 350000,
      });
      const errors = await validate(dto);
      const pvErrors = errors.filter(
        (e) => e.property === 'minimumPropertyValue',
      );
      expect(pvErrors).toHaveLength(0);
    });

    it('should reject negative value', async () => {
      const dto = plainToInstance(UpdatePolicyDto, {
        minimumPropertyValue: -1,
      });
      const errors = await validate(dto);
      const pvErrors = errors.filter(
        (e) => e.property === 'minimumPropertyValue',
      );
      expect(pvErrors.length).toBeGreaterThan(0);
    });
  });

  describe('minimumEmploymentTenureMonths', () => {
    it('should accept valid non-negative integer', async () => {
      const dto = plainToInstance(UpdatePolicyDto, {
        minimumEmploymentTenureMonths: 12,
      });
      const errors = await validate(dto);
      const tenureErrors = errors.filter(
        (e) => e.property === 'minimumEmploymentTenureMonths',
      );
      expect(tenureErrors).toHaveLength(0);
    });

    it('should accept zero', async () => {
      const dto = plainToInstance(UpdatePolicyDto, {
        minimumEmploymentTenureMonths: 0,
      });
      const errors = await validate(dto);
      const tenureErrors = errors.filter(
        (e) => e.property === 'minimumEmploymentTenureMonths',
      );
      expect(tenureErrors).toHaveLength(0);
    });

    it('should reject negative value', async () => {
      const dto = plainToInstance(UpdatePolicyDto, {
        minimumEmploymentTenureMonths: -1,
      });
      const errors = await validate(dto);
      const tenureErrors = errors.filter(
        (e) => e.property === 'minimumEmploymentTenureMonths',
      );
      expect(tenureErrors.length).toBeGreaterThan(0);
    });

    it('should reject non-integer value', async () => {
      const dto = plainToInstance(UpdatePolicyDto, {
        minimumEmploymentTenureMonths: 6.5,
      });
      const errors = await validate(dto);
      const tenureErrors = errors.filter(
        (e) => e.property === 'minimumEmploymentTenureMonths',
      );
      expect(tenureErrors.length).toBeGreaterThan(0);
    });
  });

  describe('minimumApplicantAgeMonths', () => {
    it('should accept valid non-negative integer', async () => {
      const dto = plainToInstance(UpdatePolicyDto, {
        minimumApplicantAgeMonths: 300,
      });
      const errors = await validate(dto);
      const ageErrors = errors.filter(
        (e) => e.property === 'minimumApplicantAgeMonths',
      );
      expect(ageErrors).toHaveLength(0);
    });

    it('should reject negative value', async () => {
      const dto = plainToInstance(UpdatePolicyDto, {
        minimumApplicantAgeMonths: -1,
      });
      const errors = await validate(dto);
      const ageErrors = errors.filter(
        (e) => e.property === 'minimumApplicantAgeMonths',
      );
      expect(ageErrors.length).toBeGreaterThan(0);
    });
  });

  describe('maximumApplicationAgeMonths', () => {
    it('should accept valid non-negative integer', async () => {
      const dto = plainToInstance(UpdatePolicyDto, {
        maximumApplicationAgeMonths: 828,
      });
      const errors = await validate(dto);
      const ageErrors = errors.filter(
        (e) => e.property === 'maximumApplicationAgeMonths',
      );
      expect(ageErrors).toHaveLength(0);
    });

    it('should reject negative value', async () => {
      const dto = plainToInstance(UpdatePolicyDto, {
        maximumApplicationAgeMonths: -1,
      });
      const errors = await validate(dto);
      const ageErrors = errors.filter(
        (e) => e.property === 'maximumApplicationAgeMonths',
      );
      expect(ageErrors.length).toBeGreaterThan(0);
    });
  });

  describe('isActive', () => {
    it('should accept boolean true', async () => {
      const dto = plainToInstance(UpdatePolicyDto, { isActive: true });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept boolean false', async () => {
      const dto = plainToInstance(UpdatePolicyDto, { isActive: false });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject non-boolean value', async () => {
      const dto = plainToInstance(UpdatePolicyDto, { isActive: 'yes' });
      const errors = await validate(dto);
      const activeErrors = errors.filter((e) => e.property === 'isActive');
      expect(activeErrors.length).toBeGreaterThan(0);
    });
  });

  describe('empty DTO', () => {
    it('should accept empty object (all fields optional)', async () => {
      const dto = plainToInstance(UpdatePolicyDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('combined fields', () => {
    it('should accept valid combination of fields', async () => {
      const dto = plainToInstance(UpdatePolicyDto, {
        minimumIncome: 15000,
        minimumPropertyValue: 350000,
        minimumEmploymentTenureMonths: 12,
        minimumApplicantAgeMonths: 300,
        maximumApplicationAgeMonths: 828,
        isActive: true,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('PFAE CMA cells (HU-20)', () => {
    it('should accept minimumActivityTenureMonths 24', async () => {
      const dto = plainToInstance(UpdatePolicyDto, {
        minimumActivityTenureMonths: 24,
      });
      const errors = await validate(dto);
      const tenureErrors = errors.filter(
        (e) => e.property === 'minimumActivityTenureMonths',
      );
      expect(tenureErrors).toHaveLength(0);
      expect(dto.minimumActivityTenureMonths).toBe(24);
    });

    it('should reject negative minimumActivityTenureMonths', async () => {
      const dto = plainToInstance(UpdatePolicyDto, {
        minimumActivityTenureMonths: -1,
      });
      const errors = await validate(dto);
      const tenureErrors = errors.filter(
        (e) => e.property === 'minimumActivityTenureMonths',
      );
      expect(tenureErrors.length).toBeGreaterThan(0);
    });

    it('should accept minimumIncomePfae 67000 and null', async () => {
      const filled = plainToInstance(UpdatePolicyDto, {
        minimumIncomePfae: 67000,
      });
      const empty = plainToInstance(UpdatePolicyDto, {
        minimumIncomePfae: null,
      });
      const filledErrors = await validate(filled);
      const emptyErrors = await validate(empty);
      expect(
        filledErrors.filter((e) => e.property === 'minimumIncomePfae'),
      ).toHaveLength(0);
      expect(
        emptyErrors.filter((e) => e.property === 'minimumIncomePfae'),
      ).toHaveLength(0);
      expect(filled.minimumIncomePfae).toBe(67000);
    });

    it('should reject negative minimumIncomePfae', async () => {
      const dto = plainToInstance(UpdatePolicyDto, {
        minimumIncomePfae: -100,
      });
      const errors = await validate(dto);
      const incomeErrors = errors.filter(
        (e) => e.property === 'minimumIncomePfae',
      );
      expect(incomeErrors.length).toBeGreaterThan(0);
    });

    it('should accept minimumApplicantAgeMonthsPfae 336', async () => {
      const dto = plainToInstance(UpdatePolicyDto, {
        minimumApplicantAgeMonthsPfae: 336,
      });
      const errors = await validate(dto);
      const ageErrors = errors.filter(
        (e) => e.property === 'minimumApplicantAgeMonthsPfae',
      );
      expect(ageErrors).toHaveLength(0);
      expect(dto.minimumApplicantAgeMonthsPfae).toBe(336);
    });

    it('should reject negative minimumApplicantAgeMonthsPfae', async () => {
      const dto = plainToInstance(UpdatePolicyDto, {
        minimumApplicantAgeMonthsPfae: -1,
      });
      const errors = await validate(dto);
      const ageErrors = errors.filter(
        (e) => e.property === 'minimumApplicantAgeMonthsPfae',
      );
      expect(ageErrors.length).toBeGreaterThan(0);
    });
  });
});
