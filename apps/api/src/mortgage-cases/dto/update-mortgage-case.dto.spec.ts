import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMortgageCaseDto } from './update-mortgage-case.dto';

describe('UpdateMortgageCaseDto', () => {
  // ---------------------------------------------------------------------------
  // T015 — REQ-4: Expediente Edit DTO validation
  // ---------------------------------------------------------------------------

  const validPayload = {
    creditTypeId: 2,
  };

  it('should accept valid payload with only creditTypeId', async () => {
    const dto = plainToInstance(UpdateMortgageCaseDto, validPayload);

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('should accept valid payload with all optional fields', async () => {
    const dto = plainToInstance(UpdateMortgageCaseDto, {
      creditTypeId: 2,
      propertyLocation: 'CABA',
      requestedAmount: 1500000,
      propertyValue: 2500000,
      estimatedTermMonths: 240,
      notes: 'Pre-aprobado por el comité',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // creditTypeId — required, positive integer
  // ---------------------------------------------------------------------------

  describe('creditTypeId', () => {
    it('should accept missing creditTypeId when optional', async () => {
      const dto = plainToInstance(UpdateMortgageCaseDto, {});

      const errors = await validate(dto);
      const ctErrors = errors.filter((e) => e.property === 'creditTypeId');

      expect(ctErrors.length).toBe(0);
    });

    it('should reject creditTypeId <= 0', async () => {
      const dto = plainToInstance(UpdateMortgageCaseDto, { creditTypeId: 0 });

      const errors = await validate(dto);
      const ctErrors = errors.filter((e) => e.property === 'creditTypeId');

      expect(ctErrors.length).toBeGreaterThan(0);
    });

    it('should reject non-integer creditTypeId', async () => {
      const dto = plainToInstance(UpdateMortgageCaseDto, {
        creditTypeId: 2.5,
      });

      const errors = await validate(dto);
      const ctErrors = errors.filter((e) => e.property === 'creditTypeId');

      expect(ctErrors.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // requestedAmount — optional, positive
  // ---------------------------------------------------------------------------

  describe('requestedAmount', () => {
    it('should reject requestedAmount <= 0', async () => {
      const dto = plainToInstance(UpdateMortgageCaseDto, {
        ...validPayload,
        requestedAmount: 0,
      });

      const errors = await validate(dto);
      const raErrors = errors.filter((e) => e.property === 'requestedAmount');

      expect(raErrors.length).toBeGreaterThan(0);
    });

    it('should reject negative requestedAmount', async () => {
      const dto = plainToInstance(UpdateMortgageCaseDto, {
        ...validPayload,
        requestedAmount: -500,
      });

      const errors = await validate(dto);
      const raErrors = errors.filter((e) => e.property === 'requestedAmount');

      expect(raErrors.length).toBeGreaterThan(0);
    });

    it('should accept positive requestedAmount', async () => {
      const dto = plainToInstance(UpdateMortgageCaseDto, {
        ...validPayload,
        requestedAmount: 1500000,
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // propertyValue — optional, positive
  // ---------------------------------------------------------------------------

  describe('propertyValue', () => {
    it('should reject propertyValue <= 0', async () => {
      const dto = plainToInstance(UpdateMortgageCaseDto, {
        ...validPayload,
        propertyValue: 0,
      });

      const errors = await validate(dto);
      const pvErrors = errors.filter((e) => e.property === 'propertyValue');

      expect(pvErrors.length).toBeGreaterThan(0);
    });

    it('should reject negative propertyValue', async () => {
      const dto = plainToInstance(UpdateMortgageCaseDto, {
        ...validPayload,
        propertyValue: -100,
      });

      const errors = await validate(dto);
      const pvErrors = errors.filter((e) => e.property === 'propertyValue');

      expect(pvErrors.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // estimatedTermMonths — optional, min 1
  // ---------------------------------------------------------------------------

  describe('estimatedTermMonths', () => {
    it('should reject estimatedTermMonths === 0', async () => {
      const dto = plainToInstance(UpdateMortgageCaseDto, {
        ...validPayload,
        estimatedTermMonths: 0,
      });

      const errors = await validate(dto);
      const etErrors = errors.filter((e) => e.property === 'estimatedTermMonths');

      expect(etErrors.length).toBeGreaterThan(0);
    });

    it('should reject negative estimatedTermMonths', async () => {
      const dto = plainToInstance(UpdateMortgageCaseDto, {
        ...validPayload,
        estimatedTermMonths: -12,
      });

      const errors = await validate(dto);
      const etErrors = errors.filter((e) => e.property === 'estimatedTermMonths');

      expect(etErrors.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // notes — optional string
  // ---------------------------------------------------------------------------

  describe('notes', () => {
    it('should accept string notes', async () => {
      const dto = plainToInstance(UpdateMortgageCaseDto, {
        ...validPayload,
        notes: 'Updated notes',
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });
  });

  describe('corporate fields', () => {
    it('should accept a subset of corporate fields', async () => {
      const dto = plainToInstance(UpdateMortgageCaseDto, {
        legalName: 'Acme SA de CV',
        companyRfc: 'ACM200115XX1',
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
      expect(dto.legalName).toBe('Acme SA de CV');
      expect(dto.companyRfc).toBe('ACM200115XX1');
    });

    it('should accept all five corporate fields', async () => {
      const dto = plainToInstance(UpdateMortgageCaseDto, {
        sharePercentage: '33.25',
        incorporationDate: '2018-06-01',
        shareTenureMonths: '12',
        legalName: 'Holding Norte SA de CV',
        companyRfc: 'HNO180601XX9',
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
      expect(dto.sharePercentage).toBe(33.25);
      expect(dto.incorporationDate).toBeInstanceOf(Date);
      expect(dto.shareTenureMonths).toBe(12);
      expect(dto.legalName).toBe('Holding Norte SA de CV');
      expect(dto.companyRfc).toBe('HNO180601XX9');
    });

    it('should reject invalid sharePercentage', async () => {
      const dto = plainToInstance(UpdateMortgageCaseDto, {
        sharePercentage: 0,
      });

      const errors = await validate(dto);
      const fieldErrors = errors.filter((e) => e.property === 'sharePercentage');

      expect(fieldErrors.length).toBeGreaterThan(0);
    });

    it('should reject invalid companyRfc', async () => {
      const dto = plainToInstance(UpdateMortgageCaseDto, {
        companyRfc: 'GARM920604ABC',
      });

      const errors = await validate(dto);
      const fieldErrors = errors.filter((e) => e.property === 'companyRfc');

      expect(fieldErrors.length).toBeGreaterThan(0);
    });
  });

  describe('personType is create-only', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    it('should reject personType PM with forbidNonWhitelisted', async () => {
      await expect(
        pipe.transform(
          {
            ...validPayload,
            personType: 'PM',
          },
          {
            type: 'body',
            metatype: UpdateMortgageCaseDto,
          },
        ),
      ).rejects.toMatchObject({
        response: {
          statusCode: 400,
          message: expect.arrayContaining(['property personType should not exist']),
        },
      });
    });

    it('should reject personType MORAL with forbidNonWhitelisted', async () => {
      await expect(
        pipe.transform(
          {
            ...validPayload,
            personType: 'MORAL',
          },
          {
            type: 'body',
            metatype: UpdateMortgageCaseDto,
          },
        ),
      ).rejects.toMatchObject({
        response: {
          statusCode: 400,
          message: expect.arrayContaining(['property personType should not exist']),
        },
      });
    });
  });
});
