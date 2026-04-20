import Database from 'better-sqlite3';
import { faker } from '@faker-js/faker';
import fs from 'fs';
import path from 'path';

// Find the D1 sqlite database
const dbDir = path.join(__dirname, '../.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const files = fs.readdirSync(dbDir);
const dbFile = files.find(f => f.endsWith('.sqlite') && f !== 'metadata.sqlite');

if (!dbFile) {
  console.error('Could not find D1 sqlite database. Ensure the local server has been started at least once.');
  process.exit(1);
}

const dbPath = path.join(dbDir, dbFile);
console.log(`Connecting to database: ${dbPath}`);

const db = new Database(dbPath);
db.pragma('foreign_keys = OFF');

const NUM_TICKETS = 10000;
const BATCH_SIZE = 1000;

console.log(`Starting insertion of ${NUM_TICKETS} tickets...`);
const start = Date.now();

// Start transaction for speed
db.exec('BEGIN TRANSACTION');

const insertSequence = db.prepare(`
  INSERT INTO ticket_sequence DEFAULT VALUES RETURNING id
`);

const insertTicket = db.prepare(`
  INSERT INTO tickets (id, subject, status, priority, customer_id, customer_email, source, created_at, updated_at, ticket_no)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertArticle = db.prepare(`
  INSERT INTO articles (id, ticket_id, sender_id, sender_type, body, is_internal, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

let inserted = 0;

for (let i = 0; i < NUM_TICKETS; i++) {
  const ticketId = faker.string.uuid();
  const subject = faker.lorem.sentence();
  const status = faker.helpers.arrayElement(['open', 'pending', 'resolved', 'closed']);
  const priority = faker.helpers.arrayElement(['normal', 'high', 'urgent']);
  const customerId = faker.string.uuid();
  const customerEmail = faker.internet.email();
  const source = faker.helpers.arrayElement(['web', 'email', 'chat']);
  const now = new Date().toISOString();

  const seqRow = insertSequence.get() as { id: number };
  
  insertTicket.run(ticketId, subject, status, priority, customerId, customerEmail, source, now, now, seqRow.id);

  // 1-3 messages (articles) per ticket
  const numMessages = faker.number.int({ min: 1, max: 3 });
  for (let j = 0; j < numMessages; j++) {
    insertArticle.run(
      faker.string.uuid(),
      ticketId,
      faker.helpers.arrayElement([customerId, 'agent-123']),
      faker.helpers.arrayElement(['customer', 'agent']),
      faker.lorem.paragraph(),
      0,
      now
    );
  }

  inserted++;
  if (inserted % BATCH_SIZE === 0) {
    db.exec('COMMIT');
    console.log(`Inserted ${inserted} tickets...`);
    db.exec('BEGIN TRANSACTION');
  }
}

db.exec('COMMIT');

const end = Date.now();
console.log(`Finished inserting ${NUM_TICKETS} tickets in ${end - start}ms.`);

// Measure read performance (e.g. querying tickets with sorting/filtering)
console.log('Measuring Read Performance...');
const readStart = Date.now();
const readStmt = db.prepare('SELECT * FROM tickets ORDER BY created_at DESC LIMIT 50');
const results = readStmt.all();
const readEnd = Date.now();

console.log(`Fetched 50 tickets in ${readEnd - readStart}ms.`);

// Count total to verify
const count = db.prepare('SELECT COUNT(*) as count FROM tickets').get() as { count: number };
console.log(`Total tickets in database: ${count.count}`);

const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[];
console.log(`Current indexes:`, indexes.map(i => i.name));

const slowReadStart = Date.now();
const countByStatus = db.prepare('SELECT status, COUNT(*) as count FROM tickets GROUP BY status').all();
const slowReadEnd = Date.now();
console.log(`Group by status in ${slowReadEnd - slowReadStart}ms:`, countByStatus);

db.close();
