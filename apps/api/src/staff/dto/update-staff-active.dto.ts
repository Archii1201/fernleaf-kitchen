import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateStaffActiveDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  active!: boolean;
}
