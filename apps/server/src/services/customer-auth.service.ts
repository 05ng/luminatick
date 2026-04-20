import { Env } from '../bindings';
import { User } from '../types';
import { EmailService } from './email/outbound.service';
import { AuthService } from './auth/auth.service';

export class CustomerAuthService {
  private emailService: EmailService;
  private authService: AuthService;

  constructor(private env: Env) {
    this.emailService = new EmailService(env);
    this.authService = new AuthService(env);
  }

  /**
   * Generates a crypto-secure token hash
   */
  private async hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Request Magic Link / OTP for a customer.
   * If the customer doesn't exist, creates a shadow user.
   */
  async requestAuth(email: string, type: 'magic_link' | 'otp' = 'magic_link', baseUrl?: string): Promise<void> {
    const lowerEmail = email.toLowerCase().trim();

    // 1. Find or create user
    let user = await this.env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(lowerEmail).first<User>();

    if (!user) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await this.env.DB.prepare(
        'INSERT INTO users (id, email, full_name, role, mfa_enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(id, lowerEmail, lowerEmail.split('@')[0], 'customer', 0, now).run();

      user = await this.env.DB.prepare(
        'SELECT * FROM users WHERE email = ?'
      ).bind(lowerEmail).first<User>();
    }

    if (!user || user.role !== 'customer') {
       // Ignore requests from non-customer roles for security, or handle differently.
       // We'll just return so we don't leak information.
       return;
    }

    // 2. Generate Token
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const plainToken = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const tokenHash = await this.hashToken(plainToken);
    const tokenId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins

    // 3. Store Token
    await this.env.DB.prepare(
      'INSERT INTO customer_auth_tokens (id, user_id, token_hash, type, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(tokenId, user.id, tokenHash, type, expiresAt).run();

    // 4. Send Email
    if (type === 'magic_link') {
      const url = `${baseUrl || 'http://localhost:5173'}/auth/verify?token=${plainToken}`;
      try {
        await this.emailService.send({
          to: [lowerEmail],
          subject: 'Your Login Link',
          html: `<p>Hello,</p><p>Click the link below to log in to your portal:</p><p><a href="${url}">${url}</a></p><p>This link expires in 15 minutes.</p>`,
          text: `Hello,\n\nClick the link below to log in to your portal:\n${url}\n\nThis link expires in 15 minutes.`,
        });
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isDev = this.env.ENVIRONMENT === 'development' || this.env.ENVIRONMENT === 'local' || !this.env.ENVIRONMENT;
        if (isDev || errorMessage.includes('validation_error') || errorMessage.includes('not verified') || errorMessage.includes('not configured')) {
          console.warn(`[DEV] Failed to send Magic Link email: ${errorMessage}`);
          console.warn(`[DEV] Magic Link URL: ${url}`);
        } else {
          throw error;
        }
      }
    } else {
      const array = new Uint32Array(1);
      crypto.getRandomValues(array);
      const otp = Math.floor(100000 + (array[0] % 900000)).toString();
      
      const otpHash = await this.hashToken(otp);
      
      // Update token in DB with OTP hash instead
      await this.env.DB.prepare(
        'UPDATE customer_auth_tokens SET token_hash = ? WHERE id = ?'
      ).bind(otpHash, tokenId).run();

      try {
        await this.emailService.send({
          to: [lowerEmail],
          subject: 'Your Login Code',
          html: `<p>Hello,</p><p>Your login code is: <strong>${otp}</strong></p><p>This code expires in 15 minutes.</p>`,
          text: `Hello,\n\nYour login code is: ${otp}\n\nThis code expires in 15 minutes.`,
        });
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isDev = this.env.ENVIRONMENT === 'development' || this.env.ENVIRONMENT === 'local' || !this.env.ENVIRONMENT;
        if (isDev || errorMessage.includes('validation_error') || errorMessage.includes('not verified') || errorMessage.includes('not configured')) {
          console.warn(`[DEV] Failed to send OTP email: ${errorMessage}`);
          console.warn(`[DEV] Login OTP Code: ${otp}`);
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Verify token and return JWT
   */
  async verifyAuth(plainToken: string): Promise<{ token: string, user: User } | null> {
    const tokenHash = await this.hashToken(plainToken);
    
    // Find valid token
    const tokenRecord = await this.env.DB.prepare(
      'SELECT * FROM customer_auth_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?'
    ).bind(tokenHash, new Date().toISOString()).first<{ user_id: string, id: string }>();

    if (!tokenRecord) {
      return null;
    }

    // Get user
    const user = await this.env.DB.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(tokenRecord.user_id).first<User>();

    if (!user) {
      return null;
    }

    // Mark as used
    await this.env.DB.prepare(
      'UPDATE customer_auth_tokens SET used_at = ? WHERE id = ?'
    ).bind(new Date().toISOString(), tokenRecord.id).run();

    // Update last_login_at
    await this.env.DB.prepare(
      'UPDATE users SET last_login_at = ? WHERE id = ?'
    ).bind(new Date().toISOString(), user.id).run();
    user.last_login_at = new Date().toISOString();

    // Generate JWT
    const jwt = await this.authService.generateToken(user, this.env.JWT_SECRET, false, "7d");

    return { token: jwt, user };
  }
}