import { IsString, IsEmail, IsOptional, IsNotEmpty, Matches } from 'class-validator';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  paternalLastName!: string;

  @IsString()
  @IsOptional()
  maternalLastName?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[A-Z&Ñ]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{3}$/, {
    message: 'El RFC ingresado no tiene un formato válido. Verifica que tenga 12 o 13 caracteres y que esté escrito correctamente.',
  })
  rfc?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[A-Z]{4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9][0-9]$/, {
    message: 'La CURP ingresada no tiene un formato válido. Verifica que tenga 18 caracteres y que esté escrita correctamente.',
  })
  curp?: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10}$/, { message: 'El teléfono debe tener 10 dígitos' })
  phone!: string;
}
