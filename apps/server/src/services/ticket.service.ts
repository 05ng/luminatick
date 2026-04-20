import { Env } from '../bindings';
import { Ticket, Article, Attachment } from '../types';
import { AutomationService } from './automation.service';
import { BroadcastService } from './broadcast.service';
import { CreateTicketWithArticleArgs } from '@luminatick/shared';

export class TicketService {
  private automationService: AutomationService;
  private broadcastService: BroadcastService;

  constructor(private env: Env, private ctx?: ExecutionContext) {
    this.automationService = new AutomationService(env);
    this.broadcastService = new BroadcastService(env);
  }

  async hydrateArticles(articles: Article[]): Promise<Article[]> {
    await Promise.all(
      articles.map(async (article) => {
        if (!article.body && article.body_r2_key) {
          try {
            const obj = await this.env.ATTACHMENTS_BUCKET.get(article.body_r2_key);
            article.body = obj ? await obj.text() : '';
          } catch (err) {
            console.error('Failed to fetch article body from R2', err);
            article.body = '';
          }
        }
      })
    );
    return articles;
  }

  async findTicketById(id: string): Promise<Ticket | null> {
    const ticket = await this.env.DB.prepare('SELECT * FROM tickets WHERE id = ?')
      .bind(id)
      .first<Ticket & { custom_fields?: string | Record<string, any> }>();

    if (ticket && typeof ticket.custom_fields === 'string') {
      try {
        ticket.custom_fields = JSON.parse(ticket.custom_fields);
      } catch (e) {
        ticket.custom_fields = {};
      }
    }
    return ticket as Ticket | null;
  }

  async findTicketBySubject(subject: string): Promise<Ticket | null> {
    // Extract ID or ticket_no from subject like [TKT-123] or [#000001]
    const match = subject.match(/\[([a-zA-Z0-9_#-]+)\]/);
    if (match) {
      const value = match[1];
      
      // Try extracting numeric ticket_no at the end of the string
      const numMatch = value.match(/(\d+)$/);
      if (numMatch) {
        const ticketNo = parseInt(numMatch[1], 10);
        const ticket = await this.env.DB.prepare('SELECT * FROM tickets WHERE ticket_no = ?')
          .bind(ticketNo)
          .first<Ticket>();
        if (ticket) return ticket;
      }
      
      // Fallback to exact ID match
      return await this.findTicketById(value);
    }
    return null;
  }

  async findTickets(
    options: {
      page?: number;
      limit?: number;
      filterId?: string;
      status?: string;
      priority?: string;
      assignedTo?: string;
      groupId?: string;
      ticketNo?: string;
      search?: string;
      customerEmail?: string;
    }
  ): Promise<{ data: Ticket[]; meta: { total: number; page: number; limit: number; total_pages: number } }> {
    const page = options.page || 1;
    const limit = options.limit || 50;
    const offset = (page - 1) * limit;

    let query = "SELECT tickets.*, (SELECT snippet FROM articles WHERE ticket_id = tickets.id ORDER BY created_at DESC LIMIT 1) as snippet FROM tickets WHERE 1=1";
    let countQuery = "SELECT COUNT(*) as total FROM tickets WHERE 1=1";
    const params: any[] = [];

    if (options.customerEmail) {
      query += " AND customer_email = ?";
      countQuery += " AND customer_email = ?";
      params.push(options.customerEmail);
    }

    if (options.search) {
      const numericMatch = options.search.match(/\d+/);
      const searchPattern = `%${options.search}%`;

      let searchCondition = "(subject LIKE ? OR customer_email LIKE ? OR id LIKE ? OR EXISTS (SELECT 1 FROM articles WHERE ticket_id = tickets.id AND (snippet LIKE ? OR body LIKE ?)))";
      const searchParams = [searchPattern, searchPattern, searchPattern, searchPattern, searchPattern];

      if (numericMatch) {
        searchCondition = `(${searchCondition} OR CAST(ticket_no AS TEXT) LIKE ?)`;
        const numPattern = `%${numericMatch[0]}%`;
        searchParams.push(numPattern);
      }

      query += ` AND ${searchCondition}`;
      countQuery += ` AND ${searchCondition}`;
      params.push(...searchParams);
    }

    if (options.filterId) {
      const filter = await this.env.DB.prepare("SELECT conditions FROM ticket_filters WHERE id = ?")
        .bind(options.filterId)
        .first<{ conditions: string }>();

      if (filter) {
        try {
          const conditions = JSON.parse(filter.conditions);
          if (Array.isArray(conditions)) {
            for (const condition of conditions) {
              const { field, operator, value } = condition;
              // Prevent SQL injection by allowing only specific fields
              const allowedFields = ["status", "priority", "assigned_to", "group_id", "source", "subject", "customer_email", "ticket_no"];
              if (allowedFields.includes(field)) {
                if (operator === "in" && typeof value === "string" && value.length > 0) {
                  const vals = value.split(",");
                  query += ` AND ${field} IN (${vals.map(() => "?").join(",")})`;
                  countQuery += ` AND ${field} IN (${vals.map(() => "?").join(",")})`;
                  params.push(...vals);
                } else if (operator === "in" && Array.isArray(value) && value.length > 0) {
                  query += ` AND ${field} IN (${value.map(() => "?").join(",")})`;
                  countQuery += ` AND ${field} IN (${value.map(() => "?").join(",")})`;
                  params.push(...value);
                } else if (operator === "equals" && value !== undefined && value !== null) {
                  query += ` AND ${field} = ?`;
                  countQuery += ` AND ${field} = ?`;
                  params.push(value);
                } else if (operator === "not_equals" && value !== undefined && value !== null) {
                  query += ` AND ${field} != ?`;
                  countQuery += ` AND ${field} != ?`;
                  params.push(value);
                } else if (operator === "contains" && typeof value === "string" && value.length > 0) {
                  query += ` AND ${field} LIKE ?`;
                  countQuery += ` AND ${field} LIKE ?`;
                  params.push(`%${value}%`);
                }
              }
            }
          }
        } catch (e) {
          console.error("Failed to parse filter conditions", e);
        }
      }
    } else {
      if (options.status) {
        const statuses = options.status.split(",");
        query += ` AND status IN (${statuses.map(() => "?").join(",")})`;
        countQuery += ` AND status IN (${statuses.map(() => "?").join(",")})`;
        params.push(...statuses);
      }
      if (options.priority) {
        const priorities = options.priority.split(",");
        query += ` AND priority IN (${priorities.map(() => "?").join(",")})`;
        countQuery += ` AND priority IN (${priorities.map(() => "?").join(",")})`;
        params.push(...priorities);
      }
      if (options.assignedTo) {
        query += " AND assigned_to = ?";
        countQuery += " AND assigned_to = ?";
        params.push(options.assignedTo);
      }
      if (options.groupId) {
        query += " AND group_id = ?";
        countQuery += " AND group_id = ?";
        params.push(options.groupId);
      }
      if (options.ticketNo) {
        query += " AND ticket_no = ?";
        countQuery += " AND ticket_no = ?";
        params.push(parseInt(options.ticketNo));
      }
    }

    const countResult = await this.env.DB.prepare(countQuery)
      .bind(...params)
      .first<{ total: number }>();
    const total = countResult?.total || 0;
    const totalPages = Math.ceil(total / limit);

    query += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const { results } = await this.env.DB.prepare(query)
      .bind(...params)
      .all<Ticket & { custom_fields?: string | Record<string, any> }>();

    const data = results.map((ticket) => {
      if (typeof ticket.custom_fields === 'string') {
        try {
          ticket.custom_fields = JSON.parse(ticket.custom_fields);
        } catch (e) {
          ticket.custom_fields = {};
        }
      }
      return ticket as Ticket;
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        total_pages: totalPages,
      },
    };
  }

  private async dispatchAutomation(eventType: string, payload: { ticket: Ticket; article?: Article }): Promise<void> {
    const promise = this.automationService.dispatch(eventType, payload);
    if (this.ctx) {
      this.ctx.waitUntil(promise);
    } else {
      await promise;
    }
  }

  async ensureCustomerUser(email: string): Promise<string> {
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail) {
      throw new Error('Email is required to ensure customer user');
    }

    const existing = await this.env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(normalizedEmail)
      .first<{ id: string }>();
    if (existing) {
      return existing.id;
    }

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    // Create shadow user
    await this.env.DB.prepare(
      `INSERT INTO users (id, email, full_name, role, created_at, last_active_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(newId, normalizedEmail, normalizedEmail.split('@')[0], 'customer', now, now)
      .run();
    
    return newId;
  }

  async createTicket(data: Partial<Ticket> & { subject: string; customer_email: string; source: string }): Promise<Ticket> {
    const id = data.id || crypto.randomUUID();
    const now = new Date().toISOString();
    
    // Ensure customer user exists
    let customerId = data.customer_id;
    if (!customerId && data.customer_email) {
      customerId = await this.ensureCustomerUser(data.customer_email);
    }

    // Get next ticket_no from sequence
    const sequenceResult = await this.env.DB.prepare(
      'INSERT INTO ticket_sequence DEFAULT VALUES RETURNING id'
    ).first<{ id: number }>();
    const ticket_no = sequenceResult?.id;

    await this.env.DB.prepare(
      `INSERT INTO tickets (id, ticket_no, subject, status, priority, customer_id, customer_email, assigned_to, group_id, custom_fields, source, source_email, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        ticket_no,
        data.subject,
        data.status || 'open',
        data.priority || 'normal',
        customerId || null,
        data.customer_email,
        data.assigned_to || null,
        data.group_id || null,
        data.custom_fields ? JSON.stringify(data.custom_fields) : null,
        data.source,
        data.source_email || null,
        now,
        now
      )
      .run();

    const ticket = (await this.findTicketById(id))!;
    await this.dispatchAutomation('ticket.created', { ticket });
    
    // Broadcast real-time notification
    if (this.ctx) {
      this.ctx.waitUntil(this.broadcastService.notifyTicketCreated(ticket));
    } else {
      await this.broadcastService.notifyTicketCreated(ticket);
    }

    return ticket;
  }

  async createTicketWithArticle(data: CreateTicketWithArticleArgs): Promise<{ ticket: Ticket, article: Article }> {
    const ticketId = crypto.randomUUID();
    const articleId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Ensure customer user exists
    let customerId = data.customer_id;
    if (!customerId && data.customer_email) {
      customerId = await this.ensureCustomerUser(data.customer_email);
    }

    // Get next ticket_no from sequence
    const sequenceResult = await this.env.DB.prepare(
      'INSERT INTO ticket_sequence DEFAULT VALUES RETURNING id'
    ).first<{ id: number }>();
    const ticket_no = sequenceResult?.id;
    
    const ticketInsert = this.env.DB.prepare(
      `INSERT INTO tickets (id, ticket_no, subject, status, priority, customer_id, customer_email, assigned_to, group_id, custom_fields, source, source_email, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      ticketId,
      ticket_no,
      data.subject,
      data.status || 'open',
      data.priority || 'normal',
      customerId || null,
      data.customer_email,
      data.assigned_to || null,
      data.group_id || null,
      data.custom_fields ? JSON.stringify(data.custom_fields) : null,
      data.source,
      data.source_email || null,
      now,
      now
    );

    // Provide the customerId as sender_id if it's an initial public message created with the ticket by customer
    const senderId = data.sender_id || customerId || null;

    const bodyR2Key = `tickets/${ticketId}/articles/${articleId}/body.txt`;
    const snippet = data.body ? data.body.substring(0, 250) : null;
    
    await this.env.ATTACHMENTS_BUCKET.put(bodyR2Key, data.body || '');

    const articleInsert = this.env.DB.prepare(
      `INSERT INTO articles (id, ticket_id, sender_id, sender_type, body, body_r2_key, snippet, is_internal, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      articleId,
      ticketId,
      senderId,
      data.sender_type || 'agent',
      null, // body is now null in DB
      bodyR2Key,
      snippet,
      0, // is_internal = false
      now
    );

    await this.env.DB.batch([ticketInsert, articleInsert]);

    const ticket = (await this.findTicketById(ticketId))!;
    const article = (await this.env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(articleId).first<Article>())!;
    
    // Attach body to returned article
    article.body = data.body || '';

    // Dispatch automations and notifications
    const dispatchPromise = (async () => {
      await this.dispatchAutomation('ticket.created', { ticket });
      await this.dispatchAutomation('article.created', { ticket, article });
      await this.broadcastService.notifyTicketCreated(ticket);
    })();
    
    if (this.ctx) {
      this.ctx.waitUntil(dispatchPromise);
    } else {
      await dispatchPromise;
    }

    return { ticket, article };
  }

  async createArticle(data: Partial<Article> & { ticket_id: string; body: string; sender_type: string }): Promise<Article> {
    const id = data.id || crypto.randomUUID();
    const now = new Date().toISOString();
    
    let senderId = data.sender_id || null;
    const ticket = (await this.findTicketById(data.ticket_id))!;
    
    // If it's a customer message and no sender_id is provided, use the ticket's customer_id
    if (data.sender_type === 'customer' && !senderId && ticket.customer_id) {
      senderId = ticket.customer_id;
    }

    const bodyR2Key = `tickets/${data.ticket_id}/articles/${id}/body.txt`;
    const snippet = data.body ? data.body.substring(0, 250) : null;

    await this.env.ATTACHMENTS_BUCKET.put(bodyR2Key, data.body || '');

    await this.env.DB.prepare(
      `INSERT INTO articles (id, ticket_id, sender_id, sender_type, body, body_r2_key, snippet, raw_email_id, qa_type, is_internal, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        data.ticket_id,
        senderId,
        data.sender_type,
        null, // body is now null in DB
        bodyR2Key,
        snippet,
        data.raw_email_id || null,
        data.qa_type || null,
        data.is_internal ? 1 : 0,
        now
      )
      .run();

    const article = (await this.env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first<Article>())!;
    
    // Attach body to returned article
    article.body = data.body || '';
    await this.dispatchAutomation('article.created', { ticket, article });

    // Broadcast ticket update
    if (this.ctx) {
      this.ctx.waitUntil(this.broadcastService.notifyTicketUpdated(ticket));
    } else {
      await this.broadcastService.notifyTicketUpdated(ticket);
    }

    return article;
  }

  async addAttachment(data: { article_id: string; file_name: string; file_size: number; content_type: string; r2_key: string }): Promise<Attachment> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.env.DB.prepare(
      `INSERT INTO attachments (id, article_id, file_name, file_size, content_type, r2_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        data.article_id ?? null,
        data.file_name ?? null,
        data.file_size ?? null,
        data.content_type ?? null,
        data.r2_key ?? null,
        now
      )
      .run();

    return (await this.env.DB.prepare('SELECT * FROM attachments WHERE id = ?').bind(id).first<Attachment>())!;
  }

  async updateTicket(id: string, data: Partial<Ticket> & { custom_fields?: Record<string, any> }): Promise<Ticket> {
    const allowedUpdates = ["status", "priority", "group_id", "assigned_to", "custom_fields"] as const;
    const updates: string[] = [];
    const params: any[] = [];

    for (const key of allowedUpdates) {
      if (data[key as keyof typeof data] !== undefined) {
        updates.push(`${key} = ?`);
        if (key === "custom_fields") {
          params.push(data.custom_fields ? JSON.stringify(data.custom_fields) : null);
        } else {
          params.push(data[key as keyof typeof data]);
        }
      }
    }

    if (updates.length > 0) {
      const now = new Date().toISOString();
      updates.push("updated_at = ?");
      params.push(now);
      params.push(id);

      await this.env.DB.prepare(`UPDATE tickets SET ${updates.join(", ")} WHERE id = ?`)
        .bind(...params)
        .run();
    }

    return (await this.findTicketById(id))!;
  }

  async updateTicketTimestamp(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.env.DB.prepare('UPDATE tickets SET updated_at = ? WHERE id = ?').bind(now, id).run();
  }

  async findLastCustomerArticle(ticketId: string): Promise<Article | null> {
    const article = await this.env.DB.prepare(
      'SELECT * FROM articles WHERE ticket_id = ? AND sender_type = "customer" ORDER BY created_at DESC LIMIT 1'
    )
      .bind(ticketId)
      .first<Article>();
      
    if (article) {
      await this.hydrateArticles([article]);
    }
    return article || null;
  }

  async findTicketByRawEmailId(rawEmailId: string): Promise<Ticket | null> {
    const article = await this.env.DB.prepare(
      'SELECT ticket_id FROM articles WHERE raw_email_id = ? LIMIT 1'
    )
      .bind(rawEmailId)
      .first<{ ticket_id: string }>();

    if (article) {
      return await this.findTicketById(article.ticket_id);
    }
    return null;
  }
}
