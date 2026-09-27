import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiPropertyOptional({
    example: 'johndoe',
    description: 'Username (auto-generated from first and last name if not provided)'
  })
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  @IsOptional()
  username?: string;

  @ApiPropertyOptional({
    example: 'user@example.com',
    description: 'User email address (optional)'
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsOptional()
  email?: string;

  @ApiProperty({
    example: 'password123',
    description: 'User password',
    minLength: 6
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;

  @ApiProperty({
    example: 'John',
    description: 'First name of the user'
  })
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  firstName: string;

  @ApiProperty({
    example: 'Doe',
    description: 'Last name of the user'
  })
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  lastName: string;

  @ApiProperty({
    example: 'clm1234567890',
    description: 'Role ID'
  })
  @IsString()
  @IsNotEmpty({ message: 'Role ID is required' })
  roleId: string;

  @ApiPropertyOptional({
    example: '+57 311 832 2699',
    description: 'Phone number (optional)'
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Cargo ID (optional)'
  })
  @IsUUID()
  @IsOptional()
  cargoId?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({
    example: 'johndoe',
    description: 'Username'
  })
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  @IsOptional()
  username?: string;

  @ApiPropertyOptional({
    example: 'user@example.com',
    description: 'User email address'
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    example: 'password123',
    description: 'User password',
    minLength: 6
  })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @IsOptional()
  password?: string;

  @ApiPropertyOptional({
    example: 'John',
    description: 'First name of the user'
  })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({
    example: 'Doe',
    description: 'Last name of the user'
  })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({
    example: 'clm1234567890',
    description: 'Role ID'
  })
  @IsString()
  @IsOptional()
  roleId?: string;

  @ApiPropertyOptional({
    example: '+57 311 832 2699',
    description: 'Phone number (optional)'
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Cargo ID (optional, set to null to remove)'
  })
  @IsUUID()
  @IsOptional()
  cargoId?: string | null;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the user account is active'
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

/** Sedes en las que opera un usuario. Ver docs/PLAN_SEDES.md §5. */
export class SetUserLocationsDto {
  @ApiProperty({
    type: [String],
    description: 'Sedes permitidas. Vacío: el usuario queda sin sede.',
  })
  @IsArray()
  @IsUUID('all', { each: true })
  locationIds: string[];

  @ApiPropertyOptional({
    description: 'Sede en la que entra al iniciar sesión. Tiene que estar entre las permitidas.',
    nullable: true,
  })
  @IsUUID()
  @IsOptional()
  defaultLocationId?: string | null;
}
