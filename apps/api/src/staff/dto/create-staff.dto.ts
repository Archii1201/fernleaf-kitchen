import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Normalizes email the same way `AuthService.login` looks it up. */
const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateStaffDto {
  @ApiProperty({ example: 'new.chef@test.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'Test@1234', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ description: 'Id of an existing role' })
  @IsUUID()
  roleId!: string;

  @ApiProperty({ example: 'CHEF-002' })
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  staffCode!: string;

  @ApiProperty({ example: 'Asha Menon' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ example: 'Sous chef' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;
}
