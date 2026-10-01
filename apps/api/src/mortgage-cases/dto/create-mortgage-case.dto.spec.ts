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

  it('should reject personType different from SALARIED and PFAE', async () => {
    const dto = plainToInstance(CreateMortgageCaseDto, {
      ...validPayload,
      personType: 'INDEPENDENT',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('personType');
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
