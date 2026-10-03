import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UpdateStaffRoleDto {
  @ApiProperty({ description: 'Id of an existing role' })
  @IsUUID()
  roleId!: string;
}
