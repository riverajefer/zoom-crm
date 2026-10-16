import { IsNotEmpty, IsString, MinLength, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class LoginDto {
  @ApiProperty({
    example: 'adminsistema',
    description: 'Username'
  })
  @IsString()
  @IsNotEmpty({ message: 'Username is required' })
  username: string;

  @ApiProperty({
    example: 'admin123',
    description: 'User password',
    minLength: 6
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    example: 'clm1234567890',
    description: 'User ID'
  })
  @IsString()
  @IsNotEmpty({ message: 'User ID is required' })
  userId: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Refresh token'
  })
  @IsString()
  @IsNotEmpty({ message: 'Refresh token is required' })
  refreshToken: string;
}

export class LogoutDto {
  @ApiProperty({
    example: true,
    description:
      'Solo fuera de producción: sale aunque el encargado tenga la caja abierta ' +
      '(para pruebas con varios usuarios). En producción se ignora.',
    required: false,
  })
  // Del valor crudo: la conversión implícita global vuelve `true` cualquier
  // texto, incluso "false".
  @Transform(({ obj }) => obj.force === true)
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

export class ChangePasswordDto {
  @ApiProperty({
    example: 'currentPassword123',
    description: 'Current password',
  })
  @IsString()
  @IsNotEmpty({ message: 'Current password is required' })
  currentPassword: string;

  @ApiProperty({
    example: 'newPassword456',
    description: 'New password',
    minLength: 6,
  })
  @IsString()
  @IsNotEmpty({ message: 'New password is required' })
  @MinLength(6, { message: 'New password must be at least 6 characters' })
  newPassword: string;
}

export class VerifyPasswordDto {
  @ApiProperty({
    example: 'myPassword123',
    description: 'Password to verify',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password: string;
}

export class UpdateProfilePhotoDto {
  @ApiProperty({
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    description: 'Profile photo as base64 encoded string or URL',
    required: false,
  })
  @IsString()
  @IsOptional()
  profilePhoto?: string;
}
