import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryDocumentDto } from './query-document.dto';

describe('QueryDocumentDto', () => {
  it('should be valid with no fields (all optional)', async () => {
    const dto = plainToInstance(QueryDocumentDto, {});

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('should accept optional page and limit', async () => {
    const dto = plainToInstance(QueryDocumentDto, { page: 1, limit: 20 });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('should reject page < 1', async () => {
    const dto = plainToInstance(QueryDocumentDto, { page: 0 });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('page');
  });

  it('should reject limit < 1', async () => {
    const dto = plainToInstance(QueryDocumentDto, { limit: -5 });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('limit');
  });
});
