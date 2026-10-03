import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StaffRoleResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'Kitchen' })
  name!: string;
}

export class StaffProfileResponse {
  @ApiProperty({ example: 'CHEF-002' })
  staffCode!: string;

  @ApiProperty({ example: 'Asha Menon' })
  fullName!: string;

  @ApiPropertyOptional({ nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({ nullable: true })
  jobTitle!: string | null;
}

/** Safe view of a staff account: no password and no hash, ever. */
export class StaffResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'kitchen@test.com' })
  email!: string;

  @ApiProperty()
  active!: boolean;

  @ApiProperty({ type: StaffRoleResponse })
  role!: StaffRoleResponse;

  @ApiPropertyOptional({ type: StaffProfileResponse, nullable: true })
  profile!: StaffProfileResponse | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
