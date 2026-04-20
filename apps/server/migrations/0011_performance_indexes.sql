-- Add indexes for common dashboard and portal queries
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_group_id ON tickets(group_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);

CREATE INDEX IF NOT EXISTS idx_articles_ticket_id ON articles(ticket_id);
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at);
