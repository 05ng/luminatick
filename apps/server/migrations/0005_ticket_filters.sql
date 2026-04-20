CREATE TABLE IF NOT EXISTS ticket_filters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    conditions TEXT NOT NULL,
    is_system BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO ticket_filters (id, name, conditions, is_system) 
VALUES 
('filter_system_open', 'Open Tickets', '[{"field": "status", "operator": "in", "value": "open,pending"}]', 1),
('filter_system_all', 'All Tickets', '[]', 1);
