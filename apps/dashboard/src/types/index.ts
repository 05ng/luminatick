export interface Ticket {
  id: string;
  ticket_no: number;
  subject: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  customer_id?: string;
  customer_email: string;
  assigned_to?: string;
  group_id?: string;
  custom_fields?: Record<string, any>;
  source: 'email' | 'web' | 'widget' | 'api';
  created_at: string;
  updated_at: string;
}

export interface Article {
  id: string;
  ticket_id: string;
  sender_id?: string;
  sender_type: 'customer' | 'agent' | 'system';
  body: string;
  raw_email_id?: string;
  qa_type?: 'question' | 'answer';
  is_internal: boolean;
  attachments?: Attachment[];
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'agent' | 'customer';
  mfa_enabled: boolean;
  created_at: string;
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

export interface Attachment {
  id: string;
  article_id: string;
  filename: string;
  content_type: string;
  size: number;
  storageKey: string;
}

export interface TicketWithDetails extends Ticket {
  articles: Article[];
  // attachments?: Attachment[];
}

export interface AutomationRule {
  id: string;
  name: string;
  event_type: 'ticket.created' | 'article.created' | 'ticket.updated' | 'scheduled.retention';
  conditions?: string;
  action_type: 'webhook' | 'retention';
  action_config: string;
  is_active: boolean;
  created_at: string;
}

export interface AutomationCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'regex';
  value: string;
}

export interface WebhookConfig {
  url: string;
  method: 'POST' | 'PUT';
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

export interface GroupMember extends User {
  group_id: string;
  user_id: string;
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  category_id: string | null;
  file_path: string;
  status: 'active' | 'processing' | 'error';
  created_at: string;
}
