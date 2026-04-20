const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

function runCommand(command, silent = false) {
  if (!silent) console.log(`Executing: ${command}`);
  try {
    const output = execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    if (!silent && output && !command.includes('--json')) {
      console.log(output.trim());
    }
    return output;
  } catch (error) {
    if (!silent) {
      console.error(`Error executing command: ${command}`);
      console.error(error.stderr || error.stdout || error.message);
    }
    return null;
  }
}

function getJsonOutput(command) {
  const output = runCommand(command, true);
  if (!output) return null;
  try {
    const jsonStart = output.indexOf('[');
    const jsonObjStart = output.indexOf('{');
    let startIdx = jsonStart;
    if (jsonStart === -1 || (jsonObjStart !== -1 && jsonObjStart < jsonStart)) {
        startIdx = jsonObjStart;
    }
    if (startIdx === -1) return null;
    return JSON.parse(output.substring(startIdx));
  } catch (e) {
    return null;
  }
}

async function setup() {
  console.log('--- Luminatick Infrastructure Provisioning ---');

  // 1. D1 Database
  console.log('\nChecking D1 Database...');
  const d1List = getJsonOutput('npx wrangler d1 list --json') || [];
  let dbId = null;
  const existingDb = d1List.find(db => db.name === 'luminatick-db');
  
  if (existingDb) {
    dbId = existingDb.uuid;
    console.log(`✅ D1 Database 'luminatick-db' already exists. ID: ${dbId}`);
  } else {
    const d1Output = runCommand('npx wrangler d1 create luminatick-db');
    if (d1Output) {
      const dbIdMatch = d1Output.match(/database_id["\s:=]+([a-f0-9\-]+)/i);
      if (dbIdMatch && dbIdMatch[1]) {
        dbId = dbIdMatch[1];
        console.log(`✅ D1 Database created. ID: ${dbId}`);
      }
    }
  }

  if (dbId) {
    // Update wrangler.json
    const wranglerPath = path.join(__dirname, '..', 'apps', 'server', 'wrangler.json');
    if (fs.existsSync(wranglerPath)) {
      let wranglerContent = fs.readFileSync(wranglerPath, 'utf-8');
      
      if (wranglerContent.includes('REPLACE_WITH_D1_DATABASE_ID')) {
        wranglerContent = wranglerContent.replace('REPLACE_WITH_D1_DATABASE_ID', dbId);
        fs.writeFileSync(wranglerPath, wranglerContent);
        console.log(`✅ Updated apps/server/wrangler.json with new database_id.`);
      } else {
        const currentIdMatch = wranglerContent.match(/"database_id"\s*:\s*"([a-f0-9\-]+)"/);
        if (currentIdMatch && currentIdMatch[1] !== dbId) {
           wranglerContent = wranglerContent.replace(currentIdMatch[1], dbId);
           fs.writeFileSync(wranglerPath, wranglerContent);
           console.log(`✅ Updated apps/server/wrangler.json with correct database_id.`);
        } else if (currentIdMatch && currentIdMatch[1] === dbId) {
           console.log(`✅ apps/server/wrangler.json already has correct database_id.`);
        }
      }
    } else {
      console.warn(`⚠️ apps/server/wrangler.json not found at ${wranglerPath}`);
    }
  }

  // 2. R2 Buckets
  console.log('\nChecking R2 Buckets...');
  const r2ListOut = runCommand('npx wrangler r2 bucket list', true) || '';
  
  if (r2ListOut.includes('name:           luminatick-attachments')) {
    console.log(`✅ R2 Bucket 'luminatick-attachments' already exists.`);
  } else {
    runCommand('npx wrangler r2 bucket create luminatick-attachments');
    console.log(`✅ R2 Bucket 'luminatick-attachments' created.`);
  }

  if (r2ListOut.includes('name:           luminatick-widget')) {
    console.log(`✅ R2 Bucket 'luminatick-widget' already exists.`);
  } else {
    runCommand('npx wrangler r2 bucket create luminatick-widget');
    console.log(`✅ R2 Bucket 'luminatick-widget' created.`);
  }

  // 3. Vectorize Index
  console.log('\nChecking Vectorize Index...');
  const vectorizeList = getJsonOutput('npx wrangler vectorize list --json') || [];
  const existingVectorize = vectorizeList.find(idx => idx.name === 'luminatick-index');

  if (existingVectorize) {
    console.log(`✅ Vectorize index 'luminatick-index' already exists.`);
  } else {
    runCommand('npx wrangler vectorize create luminatick-index --dimensions=1024 --metric=cosine');
    console.log(`✅ Vectorize index created.`);
  }

  // 4. Pages Projects
  console.log('\nChecking Cloudflare Pages Projects...');
  const pagesList = getJsonOutput('npx wrangler pages project list --json') || [];
  
  const existingDashboard = pagesList.find(p => p['Project Name'] === 'luminatick-dashboard' || p.name === 'luminatick-dashboard');
  if (existingDashboard) {
    console.log(`✅ Pages project 'luminatick-dashboard' already exists.`);
  } else {
    runCommand('npx wrangler pages project create luminatick-dashboard --production-branch main');
    console.log(`✅ Pages project 'luminatick-dashboard' created.`);
  }

  const existingPortal = pagesList.find(p => p['Project Name'] === 'luminatick-portal' || p.name === 'luminatick-portal');
  if (existingPortal) {
    console.log(`✅ Pages project 'luminatick-portal' already exists.`);
  } else {
    runCommand('npx wrangler pages project create luminatick-portal --production-branch main');
    console.log(`✅ Pages project 'luminatick-portal' created.`);
  }

  console.log('\n--- Setup Complete ---');
  console.log('Next steps:');
  console.log('1. Run "npm run secrets:prod" to configure secrets.');
  console.log('2. Run "npm run deploy" to deploy the backend, dashboard, portal, and widget.');
  console.log('3. Run "npm run seed:prod" to seed the production database.');
  console.log('4. Log into the Admin Dashboard and configure Outbound Email (Settings -> Channels -> Email) so the Customer Portal can send OTPs.');
  console.log('5. Configure public access for the "luminatick-widget" R2 bucket in your Cloudflare dashboard.');
}

setup();
