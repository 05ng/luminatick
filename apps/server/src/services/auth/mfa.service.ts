import * as OTPAuth from "otpauth";

export class MFAService {
  /**
   * Generates a new random TOTP secret.
   * @returns The base32-encoded secret string.
   */
  public generateSecret(): string {
    return new OTPAuth.Secret({ size: 20 }).base32;
  }

  /**
   * Generates a provisioning URI for the user to scan with their TOTP app.
   * @param email The user's email address.
   * @param secret The base32-encoded secret.
   * @returns The provisioning URI string.
   */
  public getProvisioningUri(email: string, secret: string): string {
    const totp = new OTPAuth.TOTP({
      issuer: "Luminatick",
      label: email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    return totp.toString();
  }

  /**
   * Verifies a TOTP code against a secret.
   * @param code The 6-digit code provided by the user.
   * @param secret The base32-encoded secret.
   * @returns True if the code is valid, false otherwise.
   */
  public verifyCode(code: string, secret: string): boolean {
    const totp = new OTPAuth.TOTP({
      issuer: "Luminatick",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    const delta = totp.validate({
      token: code,
      window: 1, // Allow 1-period skew (30 seconds before or after)
    });

    return delta !== null;
  }

  /**
   * Encrypts the MFA secret for storage.
   */
  public async encryptSecret(secret: string, encryptionKey: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.importEncryptionKey(encryptionKey);
    const encodedSecret = new TextEncoder().encode(secret);

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encodedSecret
    );

    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    // Using btoa/atob as they are available in Workers
    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Decrypts the MFA secret.
   */
  public async decryptSecret(encryptedData: string, encryptionKey: string): Promise<string> {
    const combinedString = atob(encryptedData);
    const combined = new Uint8Array(combinedString.length);
    for (let i = 0; i < combinedString.length; i++) {
      combined[i] = combinedString.charCodeAt(i);
    }
    
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const key = await this.importEncryptionKey(encryptionKey);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  }

  private async importEncryptionKey(rawKey: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    // Use a fixed length (32 bytes) derived from the raw key
    const keyBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawKey));
    return await crypto.subtle.importKey(
      "raw",
      keyBuffer,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  }
}

export const mfaService = new MFAService();
