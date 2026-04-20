export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Ticket {
  id: string;
  ticket_no: number;
  subject: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  customer_email: string;
  created_at: string;
  updated_at: string;
}

export interface Article {
  id: string;
  ticket_id: string;
  body: string;
  sender_type: 'customer' | 'agent' | 'system';
  sender_id?: string;
  is_internal: boolean;
  created_at: string;
  attachments?: Attachment[];
}

export interface Attachment {
  id: string;
  article_id: string;
  filename: string;
  content_type: string;
  size: number;
  storage_key: string;
  url?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}
