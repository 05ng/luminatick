/**
 * Developer Shortcut: Simulate an Inbound Email
 * 
 * This script sends a POST request to the local worker's test endpoint
 * to simulate an inbound email event without needing real Gmail/Forwarding setup.
 * 
 * Usage:
 *   node scripts/simulate-email.js <from_email> "<subject>" "<body>"
 * 
 * Example:
 *   node scripts/simulate-email.js alice@example.com "Help!" "I can't log in."
 */

const from = process.argv[2] || 'customer@example.com';
const subject = process.argv[3] || 'Test Ticket';
const body = process.argv[4] || 'Hello, I need some assistance with the system.';

const messageId = `<${Math.random().toString(36).substring(2, 11)}@example.com>`;
const rawEmail = `From: ${from}
To: support@luminatick.com
Subject: ${subject}
Message-ID: ${messageId}
Date: ${new Date().toUTCString()}
Content-Type: text/plain; charset=utf-8

${body}`;

async function simulate() {
  console.log(`🚀 Simulating inbound email from ${from}...`);
  
  try {
    const response = await fetch('http://localhost:8787/api/test/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'X-From': from,
        'X-Subject': subject,
      },
      body: rawEmail,
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Success:', result.message);
    } else {
      console.error('❌ Error:', result.error || 'Unknown error');
    }
  } catch (error) {
    console.error('❌ Connection Failed: Is the worker running on http://localhost:8787?');
    console.error(`   ${error.message}`);
  }
}

simulate();
