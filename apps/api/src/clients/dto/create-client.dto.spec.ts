import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateClientDto } from './create-client.dto';

describe('CreateClientDto', () => {
  const validPayload = {
    firstName: 'María',
    paternalLastName: 'García',
    email: 'maria@example.com',
    phone: '5512345678',
  };

  // ---------------------------------------------------------------------------
  // T003 — Phone validation (REQ-6)
  // ---------------------------------------------------------------------------
  describe('phone (T003)', () => {
    it('should accept valid 10-digit phone', async () => {
      const dto = plainToInstance(CreateClientDto, validPayload);
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject phone with letters', async () => {
      const dto = plainToInstance(CreateClientDto, {
        ...validPayload,
        phone: '55abc56789',
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('phone');
      expect(errors[0].constraints).toHaveProperty('matches');
      expect(errors[0].constraints!.matches).toBe(
        'El teléfono debe tener 10 dígitos',
      );
    });

    it('should reject phone with fewer than 10 digits', async () => {
      const dto = plainToInstance(CreateClientDto, {
        ...validPayload,
        phone: '55123',
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('phone');
      expect(errors[0].constraints).toHaveProperty('matches');
    });

    it('should reject phone with more than 10 digits', async () => {
      const dto = plainToInstance(CreateClientDto, {
        ...validPayload,
        phone: '55123456789',
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('phone');
      expect(errors[0].constraints).toHaveProperty('matches');
    });

    it('should still reject empty phone via IsNotEmpty', async () => {
      const dto = plainToInstance(CreateClientDto, {
        ...validPayload,
        phone: '',
      });

      const errors = await validate(dto);

      // Both IsNotEmpty and Matches fail on empty string
      const phoneErrors = errors.filter((e) => e.property === 'phone');
      expect(phoneErrors.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // T004 — RFC/CURP friendly messages (REQ-5)
  // ---------------------------------------------------------------------------
  describe('RFC message (T004)', () => {
    it('should return friendly RFC message on invalid format', async () => {
      const dto = plainToInstance(CreateClientDto, {
        ...validPayload,
        rfc: 'INVALID',
      });

      const errors = await validate(dto);
      const rfcErrors = errors.filter((e) => e.property === 'rfc');

      expect(rfcErrors.length).toBeGreaterThan(0);
      expect(rfcErrors[0].constraints).toHaveProperty('matches');
      expect(rfcErrors[0].constraints!.matches).toBe(
        'El RFC ingresado no tiene un formato válido. Verifica que tenga 12 o 13 caracteres y que esté escrito correctamente.',
      );
    });

    it('should accept valid RFC without errors', async () => {
      const dto = plainToInstance(CreateClientDto, {
        ...validPayload,
        rfc: 'GARM920604ABC',
      });

      const errors = await validate(dto);
      const rfcErrors = errors.filter((e) => e.property === 'rfc');

      expect(rfcErrors).toHaveLength(0);
    });
  });

  describe('CURP message (T004)', () => {
    it('should return friendly CURP message on invalid format', async () => {
      const dto = plainToInstance(CreateClientDto, {
        ...validPayload,
        curp: 'INVALID',
      });

      const errors = await validate(dto);
      const curpErrors = errors.filter((e) => e.property === 'curp');

      expect(curpErrors.length).toBeGreaterThan(0);
      expect(curpErrors[0].constraints).toHaveProperty('matches');
      expect(curpErrors[0].constraints!.matches).toBe(
        'La CURP ingresada no tiene un formato válido. Verifica que tenga 18 caracteres y que esté escrita correctamente.',
      );
    });

    it('should accept valid CURP without errors', async () => {
      const dto = plainToInstance(CreateClientDto, {
        ...validPayload,
        curp: 'GARM920604HDFRNS09',
      });

      const errors = await validate(dto);
      const curpErrors = errors.filter((e) => e.property === 'curp');

      expect(curpErrors).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Existing validations (unchanged)
  // ---------------------------------------------------------------------------
  describe('existing validations', () => {
    it('should reject missing firstName', async () => {
      const dto = plainToInstance(CreateClientDto, {
        ...validPayload,
        firstName: '',
      });

      const errors = await validate(dto);
      const nameErrors = errors.filter((e) => e.property === 'firstName');

      expect(nameErrors.length).toBeGreaterThan(0);
    });

    it('should reject missing email', async () => {
      const dto = plainToInstance(CreateClientDto, {
        ...validPayload,
        email: '',
      });

      const errors = await validate(dto);
      const emailErrors = errors.filter((e) => e.property === 'email');

      expect(emailErrors.length).toBeGreaterThan(0);
    });
  });
});
