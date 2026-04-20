import * as jose from "jose";
import { JWTPayload, User } from "../../types";
import { Env } from "../../bindings";

export class AuthService {
  constructor(private env?: Env) {}

  /**
   * Generates a JWT for the given user.
   */
  public async generateToken(
    user: User,
    secret: string,
    mfaVerified: boolean = false,
    expiresIn: string = "24h"
  ): Promise<string> {
    const alg = "HS256";
    const secretKey = new TextEncoder().encode(secret);

    const payload: JWTPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      mfa_verified: mfaVerified,
      iat: Math.floor(Date.now() / 1000),
      exp: 0, // Placeholder
    };

    const token = await new jose.SignJWT({ ...payload })
      .setProtectedHeader({ alg })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(secretKey);

    return token;
  }

  /**
   * Verifies a JWT token.
   */
  public async verifyToken(token: string): Promise<User | null> {
    if (!this.env?.JWT_SECRET) return null;
    
    try {
      const secretKey = new TextEncoder().encode(this.env.JWT_SECRET);
      const { payload } = await jose.jwtVerify(token, secretKey);
      
      const jwtPayload = payload as unknown as JWTPayload;
      
      // Fetch user from DB to ensure they still exist and have the correct role
      const user = await this.env.DB.prepare(
        "SELECT id, email, full_name as name, role, mfa_enabled FROM users WHERE id = ?"
      )
        .bind(jwtPayload.sub)
        .first<User & { name: string }>();

      if (!user) return null;
      
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mfa_enabled: !!user.mfa_enabled,
      } as any;
    } catch (err) {
      console.error('Token verification failed:', err);
      return null;
    }
  }

  /**
   * Verifies the password against the hash.
   */
  public async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;

    const salt = this.base64ToUint8Array(parts[0]);
    const iterations = parseInt(parts[1], 10);
    const hash = this.base64ToUint8Array(parts[2]);

    const passwordBuffer = new TextEncoder().encode(password);
    const key = await crypto.subtle.importKey(
      "raw",
      passwordBuffer,
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: iterations,
        hash: "SHA-256"
      },
      key,
      256
    );

    const derivedArray = new Uint8Array(derivedBits);
    if (derivedArray.length !== hash.length) return false;

    // Constant-time comparison
    let equal = true;
    for (let i = 0; i < hash.length; i++) {
      if (derivedArray[i] !== hash[i]) equal = false;
    }
    return equal;
  }

  /**
   * Hashes a password using PBKDF2.
   */
  public async hashPassword(password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iterations = 100000;
    const passwordBuffer = new TextEncoder().encode(password);

    const key = await crypto.subtle.importKey(
      "raw",
      passwordBuffer,
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: iterations,
        hash: "SHA-256"
      },
      key,
      256
    );

    const hash = new Uint8Array(derivedBits);
    return `${this.uint8ArrayToBase64(salt)}:${iterations}:${this.uint8ArrayToBase64(hash)}`;
  }

  private uint8ArrayToBase64(arr: Uint8Array): string {
    return btoa(String.fromCharCode(...arr));
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
}

export const authService = new AuthService();
