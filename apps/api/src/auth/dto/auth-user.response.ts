import { ApiProperty } from '@nestjs/swagger';

/** Safe view of a user. Contains no password hash and no token. */
export class AuthUserResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'admin@test.com' })
  email!: string;

  @ApiProperty()
  roleId!: string;

  @ApiProperty({ example: 'Admin' })
  roleName!: string;
}

export class ProfileResponse extends AuthUserResponse {
  @ApiProperty({ type: [String], example: ['orders.view', 'kitchen.update'] })
  permissions!: string[];
}
