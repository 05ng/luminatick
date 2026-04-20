-- Sequential Ticket Numbers
CREATE TABLE IF NOT EXISTS ticket_sequence (
    id INTEGER PRIMARY KEY AUTOINCREMENT
);

ALTER TABLE tickets ADD COLUMN ticket_no INTEGER;
CREATE INDEX idx_tickets_ticket_no ON tickets(ticket_no);
