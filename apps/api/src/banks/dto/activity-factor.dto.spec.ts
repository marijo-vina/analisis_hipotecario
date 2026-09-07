import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateActivityFactorDto,
  UpdateActivityFactorDto,
} from './activity-factor.dto';

describe('CreateActivityFactorDto', () => {
  it('should accept Mifel health factor 1.5 (no max)', async () => {
    const dto = plainToInstance(CreateActivityFactorDto, {
      nativeLabel: 'Establecimientos y PI de salud',
      satAliases: ['medicos', 'dentistas'],
      factor: 1.5,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.factor).toBe(1.5);
  });

  it('should accept factor 0 and optional factorTaxReturn', async () => {
    const dto = plainToInstance(CreateActivityFactorDto, {
      nativeLabel: 'PFAE Servicios',
      satAliases: ['servicios'],
      factor: 0.5,
      factorTaxReturn: 0.6,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.factorTaxReturn).toBe(0.6);
  });

  it('should reject negative factor', async () => {
    const dto = plainToInstance(CreateActivityFactorDto, {
      nativeLabel: 'Comercio',
      satAliases: ['comercio'],
      factor: -0.1,
    });
    const errors = await validate(dto);
    const factorErrors = errors.filter((e) => e.property === 'factor');
    expect(factorErrors.length).toBeGreaterThan(0);
  });

  it('should reject missing nativeLabel', async () => {
    const dto = plainToInstance(CreateActivityFactorDto, {
      satAliases: ['comercio'],
      factor: 0.35,
    });
    const errors = await validate(dto);
    const labelErrors = errors.filter((e) => e.property === 'nativeLabel');
    expect(labelErrors.length).toBeGreaterThan(0);
  });
});

describe('UpdateActivityFactorDto', () => {
  it('should accept factor 1.5 with no max', async () => {
    const dto = plainToInstance(UpdateActivityFactorDto, { factor: 1.5 });
    const errors = await validate(dto);
    const factorErrors = errors.filter((e) => e.property === 'factor');
    expect(factorErrors).toHaveLength(0);
  });

  it('should reject negative factorTaxReturn', async () => {
    const dto = plainToInstance(UpdateActivityFactorDto, {
      factorTaxReturn: -0.2,
    });
    const errors = await validate(dto);
    const taxErrors = errors.filter((e) => e.property === 'factorTaxReturn');
    expect(taxErrors.length).toBeGreaterThan(0);
  });

  it('should accept empty object (all fields optional)', async () => {
    const dto = plainToInstance(UpdateActivityFactorDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
