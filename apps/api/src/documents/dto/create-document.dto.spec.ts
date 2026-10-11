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

  it('should accept omitted owner (defaults to SHAREHOLDER at persistence)', async () => {
    const dto = plainToInstance(CreateDocumentDto, validPayload);

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.owner).toBeUndefined();
  });

  it('should accept owner SHAREHOLDER', async () => {
    const dto = plainToInstance(CreateDocumentDto, {
      ...validPayload,
      owner: 'SHAREHOLDER',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.owner).toBe('SHAREHOLDER');
  });

  it('should accept owner COMPANY', async () => {
    const dto = plainToInstance(CreateDocumentDto, {
      ...validPayload,
      owner: 'COMPANY',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.owner).toBe('COMPANY');
  });

  it('should reject invalid owner values', async () => {
    const dto = plainToInstance(CreateDocumentDto, {
      ...validPayload,
      owner: 'CLIENT',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('owner');
  });

  it('should reject lowercase owner', async () => {
    const dto = plainToInstance(CreateDocumentDto, {
      ...validPayload,
      owner: 'company',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('owner');
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
