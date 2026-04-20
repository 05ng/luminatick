import { describe, it, expect } from 'vitest';
import { encryptString, decryptString } from '../crypto';

describe('Crypto Utility', () => {
  const masterKey = 'super-secret-master-key-that-is-long-enough';
  const testString = 'Hello, Luminatick! This is a secret message.';

  it('should encrypt a string successfully', async () => {
    const encrypted = await encryptString(testString, masterKey);
    expect(encrypted).toBeDefined();
    expect(typeof encrypted).toBe('string');
    expect(encrypted).not.toBe(testString);
    // Base64 encoded, should not be empty
    expect(encrypted.length).toBeGreaterThan(0);
  });

  it('should decrypt a string successfully', async () => {
    const encrypted = await encryptString(testString, masterKey);
    const decrypted = await decryptString(encrypted, masterKey);
    expect(decrypted).toBe(testString);
  });

  it('should throw an error if masterKey is missing for encryption', async () => {
    await expect(encryptString(testString, '')).rejects.toThrow('APP_MASTER_KEY is required for encryption.');
  });

  it('should throw an error if masterKey is missing for decryption', async () => {
    const encrypted = await encryptString(testString, masterKey);
    await expect(decryptString(encrypted, '')).rejects.toThrow('APP_MASTER_KEY is required for decryption.');
  });

  it('should throw an error when decrypting with wrong key', async () => {
    const encrypted = await encryptString(testString, masterKey);
    await expect(decryptString(encrypted, 'wrong-key')).rejects.toThrow('Decryption failed. Check your APP_MASTER_KEY or data integrity.');
  });

  it('should throw an error on invalid encrypted data format (too short)', async () => {
    // A base64 string that decodes to less than 12 bytes
    const shortBase64 = btoa('12345678901'); // 11 bytes
    await expect(decryptString(shortBase64, masterKey)).rejects.toThrow('Invalid encrypted data format.');
  });

  it('should throw an error on tampered encrypted data', async () => {
    const encrypted = await encryptString(testString, masterKey);
    
    // Tamper by replacing the last character (which is valid base64 character)
    const tampered = encrypted.substring(0, encrypted.length - 1) + (encrypted.endsWith('A') ? 'B' : 'A');
    
    await expect(decryptString(tampered, masterKey)).rejects.toThrow('Decryption failed. Check your APP_MASTER_KEY or data integrity.');
  });

  it('should generate different ciphertexts for the same plaintext (IV randomness)', async () => {
    const encrypted1 = await encryptString(testString, masterKey);
    const encrypted2 = await encryptString(testString, masterKey);
    
    expect(encrypted1).not.toBe(encrypted2);
    
    // Both should decrypt back to the original text
    expect(await decryptString(encrypted1, masterKey)).toBe(testString);
    expect(await decryptString(encrypted2, masterKey)).toBe(testString);
  });
});
