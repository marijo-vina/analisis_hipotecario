import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDocumentDto } from './create-document.dto';

describe('CreateDocumentDto', () => {
  const validPayload = {
    documentTypeId: 1,
    originalName: 'nomina_ene.pdf',
  };

  it('should be valid with required fields', async () => {
    const dto = plainToInstance(CreateDocumentDto, validPayload);

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('should reject when documentTypeId is missing', async () => {
    const dto = plainToInstance(CreateDocumentDto, {
      originalName: 'test.pdf',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('documentTypeId');
  });

  it('should reject when originalName is missing', async () => {
    const dto = plainToInstance(CreateDocumentDto, {
      documentTypeId: 1,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('originalName');
  });

  it('should reject documentTypeId less than 1', async () => {
    const dto = plainToInstance(CreateDocumentDto, {
      documentTypeId: 0,
      originalName: 'test.pdf',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('documentTypeId');
  });

  it('should reject non-integer documentTypeId', async () => {
    const dto = plainToInstance(CreateDocumentDto, {
      documentTypeId: 1.5,
      originalName: 'test.pdf',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('documentTypeId');
  });

  it('should reject empty originalName string', async () => {
    const dto = plainToInstance(CreateDocumentDto, {
      documentTypeId: 1,
      originalName: '',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('originalName');
  });

  it('should reject non-whitelisted properties', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        {
          ...validPayload,
          statusId: 999,
          fileUrl: 'https://evil.com',
        },
        {
          type: 'body',
          metatype: CreateDocumentDto,
        },
      ),
    ).rejects.toMatchObject({
      response: {
        statusCode: 400,
        message: expect.arrayContaining([
          'property statusId should not exist',
          'property fileUrl should not exist',
        ]),
      },
    });
  });
});
