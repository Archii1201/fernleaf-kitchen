import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('produces a bcrypt hash that is not the plaintext', async () => {
    const hash = await service.hash('Test@1234');

    expect(hash).not.toBe('Test@1234');
    expect(hash.startsWith('$2')).toBe(true);
  });

  it(
  'verifies the correct password',
  async () => {
    const hash = await service.hash('Test@1234');

    await expect(
      service.verify('Test@1234', hash),
    ).resolves.toBe(true);
  },
  10000,
);

  it('rejects a wrong password', async () => {
    const hash = await service.hash('Test@1234');

    await expect(service.verify('Test@12345', hash)).resolves.toBe(false);
  });

  it('salts hashes so the same password hashes differently', async () => {
    const [first, second] = await Promise.all([
      service.hash('Test@1234'),
      service.hash('Test@1234'),
    ]);

    expect(first).not.toBe(second);
  });
});
