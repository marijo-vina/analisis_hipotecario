import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMortgageCaseDto } from './create-mortgage-case.dto';

describe('CreateMortgageCaseDto', () => {
  const validPayload = {
    clientId: 'a59aaf3d-9059-4504-a997-b2cbfd6fd95b',
    creditTypeId: 1,
  };

  it('should be valid with required fields only', async () => {
    const dto = plainToInstance(CreateMortgageCaseDto, validPayload);

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('should accept optional positive preprofiling fields', async () => {
    const dto = plainToInstance(CreateMortgageCaseDto, {
      ...validPayload,
      personType: 'SALARIED',
      propertyLocation: 'CABA',
      requestedAmount: 1500000.5,
      propertyValue: 2500000.75,
      estimatedTermMonths: 240,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('should accept PFAE personType', async () => {
    const dto = plainToInstance(CreateMortgageCaseDto, {
      ...validPayload,
      personType: 'PFAE',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('should reject personType different from SALARIED, PFAE and PM', async () => {
    const dto = plainToInstance(CreateMortgageCaseDto, {
      ...validPayload,
      personType: 'INDEPENDENT',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('personType');
  });

  it('should accept PM personType without corporate fields', async () => {
    const dto = plainToInstance(CreateMortgageCaseDto, {
      ...validPayload,
      personType: 'PM',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.personType).toBe('PM');
  });

  it('should reject personType MORAL', async () => {
    const dto = plainToInstance(CreateMortgageCaseDto, {
      ...validPayload,
      personType: 'MORAL',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('personType');
  });

  it('should accept optional corporate fields with PM', async () => {
    const dto = plainToInstance(CreateMortgageCaseDto, {
      ...validPayload,
      personType: 'PM',
      sharePercentage: '51.50',
      incorporationDate: '2020-01-15',
      shareTenureMonths: '24',
      legalName: 'Acme SA de CV',
      companyRfc: 'ACM200115XX1',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.sharePercentage).toBe(51.5);
    expect(dto.incorporationDate).toBeInstanceOf(Date);
    expect(dto.shareTenureMonths).toBe(24);
    expect(dto.legalName).toBe('Acme SA de CV');
    expect(dto.companyRfc).toBe('ACM200115XX1');
  });

  describe('corporate fields validation', () => {
    it('should accept sharePercentage of 100 and shareTenureMonths of 0', async () => {
      const dto = plainToInstance(CreateMortgageCaseDto, {
        ...validPayload,
        sharePercentage: 100,
        shareTenureMonths: 0,
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
      expect(dto.sharePercentage).toBe(100);
      expect(dto.shareTenureMonths).toBe(0);
    });

    it('should reject sharePercentage of 0', async () => {
      const dto = plainToInstance(CreateMortgageCaseDto, {
        ...validPayload,
        sharePercentage: 0,
      });

      const errors = await validate(dto);
      const fieldErrors = errors.filter((e) => e.property === 'sharePercentage');

      expect(fieldErrors.length).toBeGreaterThan(0);
    });

    it('should reject sharePercentage above 100', async () => {
      const dto = plainToInstance(CreateMortgageCaseDto, {
        ...validPayload,
        sharePercentage: 101,
      });

      const errors = await validate(dto);
      const fieldErrors = errors.filter((e) => e.property === 'sharePercentage');

      expect(fieldErrors.length).toBeGreaterThan(0);
    });

    it('should reject sharePercentage with more than 2 decimal places', async () => {
      const dto = plainToInstance(CreateMortgageCaseDto, {
        ...validPayload,
        sharePercentage: 51.555,
      });

      const errors = await validate(dto);
      const fieldErrors = errors.filter((e) => e.property === 'sharePercentage');

      expect(fieldErrors.length).toBeGreaterThan(0);
    });

    it('should reject invalid incorporationDate', async () => {
      const dto = plainToInstance(CreateMortgageCaseDto, {
        ...validPayload,
        incorporationDate: 'not-a-date',
      });

      const errors = await validate(dto);
      const fieldErrors = errors.filter((e) => e.property === 'incorporationDate');

      expect(fieldErrors.length).toBeGreaterThan(0);
    });

    it('should reject negative shareTenureMonths', async () => {
      const dto = plainToInstance(CreateMortgageCaseDto, {
        ...validPayload,
        shareTenureMonths: -1,
      });

      const errors = await validate(dto);
      const fieldErrors = errors.filter((e) => e.property === 'shareTenureMonths');

      expect(fieldErrors.length).toBeGreaterThan(0);
    });

    it('should reject non-integer shareTenureMonths', async () => {
      const dto = plainToInstance(CreateMortgageCaseDto, {
        ...validPayload,
        shareTenureMonths: 1.5,
      });

      const errors = await validate(dto);
      const fieldErrors = errors.filter((e) => e.property === 'shareTenureMonths');

      expect(fieldErrors.length).toBeGreaterThan(0);
    });

    it('should reject empty legalName', async () => {
      const dto = plainToInstance(CreateMortgageCaseDto, {
        ...validPayload,
        legalName: '',
      });

      const errors = await validate(dto);
      const fieldErrors = errors.filter((e) => e.property === 'legalName');

      expect(fieldErrors.length).toBeGreaterThan(0);
    });

    it('should reject 13-character person RFC as companyRfc', async () => {
      const dto = plainToInstance(CreateMortgageCaseDto, {
        ...validPayload,
        companyRfc: 'GARM920604ABC',
      });

      const errors = await validate(dto);
      const fieldErrors = errors.filter((e) => e.property === 'companyRfc');

      expect(fieldErrors.length).toBeGreaterThan(0);
    });

    it('should reject lowercase companyRfc', async () => {
      const dto = plainToInstance(CreateMortgageCaseDto, {
        ...validPayload,
        companyRfc: 'acm200115xx1',
      });

      const errors = await validate(dto);
      const fieldErrors = errors.filter((e) => e.property === 'companyRfc');

      expect(fieldErrors.length).toBeGreaterThan(0);
    });
  });

  it('should reject requestedAmount <= 0', async () => {
    const dto = plainToInstance(CreateMortgageCaseDto, {
      ...validPayload,
      requestedAmount: 0,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('requestedAmount');
  });

  it('should reject propertyValue <= 0', async () => {
    const dto = plainToInstance(CreateMortgageCaseDto, {
      ...validPayload,
      propertyValue: -10,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('propertyValue');
  });

  it('should reject estimatedTermMonths <= 0', async () => {
    const dto = plainToInstance(CreateMortgageCaseDto, {
      ...validPayload,
      estimatedTermMonths: 0,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('estimatedTermMonths');
  });

  it('should reject advisorId/statusId with whitelist + forbidNonWhitelisted', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        {
          ...validPayload,
          advisorId: 'hack',
          statusId: 999,
        },
        {
          type: 'body',
          metatype: CreateMortgageCaseDto,
        },
      ),
    ).rejects.toMatchObject({
      response: {
        statusCode: 400,
        message: expect.arrayContaining([
          'property advisorId should not exist',
          'property statusId should not exist',
        ]),
      },
    });
  });
});
