export interface AppVariables {
  jwtPayload: JWTPayload;
  mfaPending?: boolean; // If MFA is required but not yet verified
}

export interface Ticket {
  id: string;
  ticket_no: number;
  subject: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  customer_id?: string | null;
  customer_email: string;
  assigned_to?: string | null;
  group_id?: string | null;
  custom_fields?: Record<string, any>;
  source: 'email' | 'web' | 'widget' | 'api' | 'dashboard' | 'portal';
  source_email?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Article {
  id: string;
  ticket_id: string;
  sender_id?: string;
  sender_type: 'customer' | 'agent' | 'system';
  body?: string;
  body_r2_key?: string;
  snippet?: string;
  raw_email_id?: string;
  qa_type?: 'question' | 'answer';
  is_internal: boolean;
  created_at: string;
}

export interface Attachment {
  id: string;
  article_id: string;
  file_name: string;
  file_size: number;
  content_type: string;
  r2_key: string;
  created_at: string;
}

export interface SendEmailOptions {
  to: string[];
  from?: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
  attachments?: {
    filename: string;
    content: Uint8Array;
    contentType: string;
  }[];
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'agent' | 'customer';
  password_hash?: string;
  mfa_enabled: boolean;
  mfa_secret?: string;
  created_at: string;
  last_login_at?: string;
}

export interface JWTPayload {
  sub: string;
  email: string;
  role: 'admin' | 'agent' | 'customer';
  mfa_verified: boolean;
  iat: number;
  exp: number;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    full_name: string;
    role: string;
    mfa_enabled: boolean;
  };
  mfa_required?: boolean;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  key_hash?: string;
  is_active: boolean;
  created_at: string;
  last_used_at?: string;
}

export interface ApiKeyCreatedResponse {
  apiKey: string;
  id: string;
  name: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  event_type: 'ticket.created' | 'article.created' | 'ticket.updated' | 'scheduled.retention';
  conditions?: string; // JSON
  action_type: 'webhook' | 'retention';
  action_config: string; // JSON
  is_active: boolean;
  created_at: string;
}

export interface AutomationCondition {
  field: string;
  operator: 'regex' | 'equals' | 'contains' | 'not_equals';
  value: string;
}

export interface WebhookConfig {
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
}

export interface RetentionConfig {
  days_to_keep: number;
  delete_attachments: boolean;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface UserGroup {
  user_id: string;
  group_id: string;
}

export interface SupportEmail {
  id: string;
  email_address: string;
  name?: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Setting {
  key: string;
  value: string;
  description?: string | null;
  updated_at: string;
}
