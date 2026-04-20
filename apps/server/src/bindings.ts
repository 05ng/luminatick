export interface Env {
  DB: D1Database;
  ATTACHMENTS_BUCKET: R2Bucket;
  NOTIFICATION_DO: DurableObjectNamespace;
  VECTOR_INDEX: VectorizeIndex;
  AI: any; // Using any for simplicity as Vectorize types are often experimental
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  JWT_SECRET: string;
  MFA_ENCRYPTION_KEY: string;
  APP_MASTER_KEY: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  ENVIRONMENT?: string;
  PORTAL_URL?: string;
  DISABLE_RATE_LIMIT?: string;
}
