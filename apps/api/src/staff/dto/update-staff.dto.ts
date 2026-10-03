import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Profile fields only. Role and active state have their own endpoints, and the
 * email/password of an existing account are not editable here.
 */
export class UpdateStaffDto {
  @ApiPropertyOptional({ example: 'Asha Menon' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ example: 'Head chef' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;
}
