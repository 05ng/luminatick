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

async function configure() {
  console.log('\n======================================================');
  console.log('       Frontend Environment Configuration');
  console.log('======================================================');
  console.log('The backend server (luminatick-server) was just deployed!');
  console.log('Look at the Wrangler output directly above to find its URL.');
  console.log('It typically looks like: https://luminatick-server.<your-subdomain>.workers.dev');

  let defaultUrl = '';
  const dashboardEnvPath = path.join(__dirname, '..', 'apps', 'dashboard', '.env.production');
  
  if (fs.existsSync(dashboardEnvPath)) {
    const content = fs.readFileSync(dashboardEnvPath, 'utf-8');
    const match = content.match(/VITE_API_URL=(.+)/);
    if (match && match[1]) {
      defaultUrl = match[1].trim();
    }
  }

  const prompt = defaultUrl 
    ? `\nEnter the deployed backend API URL [${defaultUrl}]: ` 
    : `\nEnter the deployed backend API URL (required): `;

  let apiUrl = await askQuestion(prompt);
  
  // Use default if user just pressed Enter
  if (!apiUrl && defaultUrl) {
    apiUrl = defaultUrl;
  }

  if (apiUrl && apiUrl.trim()) {
    const cleanUrl = apiUrl.trim().replace(/\/$/, '');
    const envContent = `VITE_API_URL=${cleanUrl}\n`;
    
    const appsToConfig = ['dashboard', 'portal', 'widget'];
    for (const app of appsToConfig) {
      const envPath = path.join(__dirname, '..', 'apps', app, '.env.production');
      fs.writeFileSync(envPath, envContent);
      console.log(`✅ Updated ${app}/.env.production: VITE_API_URL=${cleanUrl}`);
    }
    console.log('\nFrontend applications will now build using this API URL.');
    console.log('======================================================\n');
  } else {
    console.warn('\n⚠️ WARNING: No URL provided. Frontend applications may fail to connect to the backend.');
    console.warn('Deployment will continue, but you must set VITE_API_URL manually in .env.production later.\n');
  }
}

configure().catch(console.error);
