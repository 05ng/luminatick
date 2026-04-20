const { execSync } = require('child_process');
const readline = require('readline');
const crypto = require('crypto');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const secrets = [
  'JWT_SECRET',
  'APP_MASTER_KEY',
  'MFA_ENCRYPTION_KEY'
];

async function askSecret(secretName) {
  return new Promise((resolve) => {
    const defaultVal = crypto.randomBytes(32).toString('hex');
    rl.question(`Enter value for ${secretName} (leave blank for auto-generated: ${defaultVal}, or type 'skip' to skip): `, (answer) => {
      const trimmed = answer.trim();
      if (trimmed.toLowerCase() === 'skip') {
        resolve('');
      } else {
        resolve(trimmed || defaultVal);
      }
    });
  });
}

async function pushSecrets() {
  console.log('--- Luminatick Secrets Configuration ---');
  console.log('This will upload your secrets to Cloudflare for the production environment.\n');

  for (const secret of secrets) {
    const value = await askSecret(secret);
    if (value) {
      console.log(`Pushing ${secret}...`);
      try {
        execSync(`npx wrangler secret put ${secret}`, {
          input: value,
          encoding: 'utf-8',
          cwd: 'apps/server'
        });
        console.log(`✅ ${secret} uploaded successfully.`);
      } catch (error) {
        console.error(`❌ Failed to upload ${secret}`);
      }
    } else {
      console.log(`Skipping ${secret}.`);
    }
  }

  rl.close();
  console.log('\n--- Secrets Configuration Complete ---');
}

pushSecrets();
