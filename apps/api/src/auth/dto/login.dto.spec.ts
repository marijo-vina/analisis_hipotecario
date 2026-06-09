import { validate } from 'class-validator';
import { LoginDto } from './login.dto';
import { plainToInstance } from 'class-transformer';

describe('LoginDto', () => {
  it('should be valid with correct data', async () => {
    const data = {
      email: 'test@example.com',
      password: 'Password123!',
    };
    const dto = plainToInstance(LoginDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail with invalid email', async () => {
    const data = {
      email: 'invalid-email',
      password: 'Password123!',
    };
    const dto = plainToInstance(LoginDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('email');
  });

  it('should fail with empty password', async () => {
    const data = {
      email: 'test@example.com',
      password: '',
    };
    const dto = plainToInstance(LoginDto, data);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('password');
  });
});
