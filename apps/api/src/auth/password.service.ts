import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PASSWORD_SALT_ROUNDS } from './auth.constants.js';

/** Thin wrapper around bcrypt so the cost factor lives in exactly one place. */
@Injectable()
export class PasswordService {
  hash(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, PASSWORD_SALT_ROUNDS);
  }

  verify(plainPassword: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, passwordHash);
  }
}
