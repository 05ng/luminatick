import { describe, it, expect, beforeEach } from 'vitest';
import { MFAService } from '../mfa.service';
import * as OTPAuth from 'otpauth';

describe('MFAService', () => {
  let mfaService: MFAService;

  beforeEach(() => {
    mfaService = new MFAService();
  });

  describe('generateSecret', () => {
    it('should generate a base32 encoded secret of sufficient length', () => {
      const secret = mfaService.generateSecret();
      expect(secret).toBeDefined();
      expect(typeof secret).toBe('string');
      // A 20-byte secret should be 32 characters in base32
      expect(secret.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe('getProvisioningUri', () => {
    it('should generate a valid otpauth URI', () => {
      const email = 'user@example.com';
      const secret = 'JBSWY3DPEHPK3PXP'; // Known base32 string
      const uri = mfaService.getProvisioningUri(email, secret);

      expect(uri).toContain('otpauth://totp/Luminatick:user%40example.com');
      expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
      expect(uri).toContain('issuer=Luminatick');
    });
  });

  describe('verifyCode', () => {
    it('should verify a correct TOTP code', () => {
      const secret = mfaService.generateSecret();
      
      // Generate a valid code for this moment using OTPAuth directly for testing
      const totp = new OTPAuth.TOTP({
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });
      const code = totp.generate();

      const isValid = mfaService.verifyCode(code, secret);
      expect(isValid).toBe(true);
    });

    it('should fail for an incorrect TOTP code', () => {
      const secret = mfaService.generateSecret();
      const isValid = mfaService.verifyCode('000000', secret);
      expect(isValid).toBe(false);
    });

    it('should verify codes with a window skew (if implementation supports it)', () => {
      const secret = mfaService.generateSecret();
      
      const totp = new OTPAuth.TOTP({
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });

      // Get code for 30 seconds ago
      const pastTimestamp = Date.now() - 30 * 1000;
      const pastCode = totp.generate({ timestamp: pastTimestamp });

      const isValid = mfaService.verifyCode(pastCode, secret);
      expect(isValid).toBe(true);
    });
  });

  describe('encryptSecret and decryptSecret', () => {
    it('should encrypt and decrypt a secret correctly', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const key = 'test-encryption-key';
      
      const encrypted = await mfaService.encryptSecret(secret, key);
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(secret);

      const decrypted = await mfaService.decryptSecret(encrypted, key);
      expect(decrypted).toBe(secret);
    });

    it('should fail to decrypt with a wrong key', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const key = 'test-encryption-key';
      const wrongKey = 'wrong-key';
      
      const encrypted = await mfaService.encryptSecret(secret, key);
      
      await expect(mfaService.decryptSecret(encrypted, wrongKey)).rejects.toThrow();
    });
  });
});
