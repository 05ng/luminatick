import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../auth.service';
import * as jose from 'jose';
import { User } from '../../../types';

describe('AuthService', () => {
  let authService: AuthService;
  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    full_name: 'Test User',
    role: 'admin',
    mfa_enabled: false,
    created_at: new Date().toISOString(),
  };
  const secret = 'test-secret-key-at-least-32-chars-long-123456';

  beforeEach(() => {
    authService = new AuthService();
  });

  describe('hashPassword and verifyPassword', () => {
    it('should correctly hash a password and verify it', async () => {
      const password = 'mySecurePassword123';
      const hash = await authService.hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).toContain(':'); // Should have salt:iterations:hash format
      const parts = hash.split(':');
      expect(parts.length).toBe(3);
      expect(parts[1]).toBe('100000'); // Iterations

      const isValid = await authService.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should fail to verify an incorrect password', async () => {
      const password = 'mySecurePassword123';
      const wrongPassword = 'wrongPassword';
      const hash = await authService.hashPassword(password);
      
      const isValid = await authService.verifyPassword(wrongPassword, hash);
      expect(isValid).toBe(false);
    });
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', async () => {
      const token = await authService.generateToken(mockUser, secret, false, '1h');
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // Verify the token content using jose
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jose.jwtVerify(token, secretKey);

      expect(payload.sub).toBe(mockUser.id);
      expect(payload.email).toBe(mockUser.email);
      expect(payload.role).toBe(mockUser.role);
      expect(payload.mfa_verified).toBe(false);
    });

    it('should set mfa_verified to true in the token when requested', async () => {
      const token = await authService.generateToken(mockUser, secret, true, '1h');
      
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jose.jwtVerify(token, secretKey);

      expect(payload.mfa_verified).toBe(true);
    });
  });
});
