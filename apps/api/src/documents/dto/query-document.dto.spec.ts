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

  describe('documentStatusId', () => {
    it('should accept valid documentStatusId (1)', async () => {
      const dto = plainToInstance(QueryDocumentDto, { documentStatusId: 1 });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should accept valid documentStatusId (8)', async () => {
      const dto = plainToInstance(QueryDocumentDto, { documentStatusId: 8 });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should be optional — empty object is valid', async () => {
      const dto = plainToInstance(QueryDocumentDto, {});

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should reject documentStatusId = 0', async () => {
      const dto = plainToInstance(QueryDocumentDto, { documentStatusId: 0 });

      const errors = await validate(dto);

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('documentStatusId');
    });

    it('should reject negative documentStatusId', async () => {
      const dto = plainToInstance(QueryDocumentDto, { documentStatusId: -1 });

      const errors = await validate(dto);

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('documentStatusId');
    });

    it('should reject non-integer documentStatusId', async () => {
      const dto = plainToInstance(QueryDocumentDto, { documentStatusId: 'abc' });

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('documentStatusId');
    });
  });
});
