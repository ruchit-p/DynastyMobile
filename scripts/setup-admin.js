#!/usr/bin/env node

/**
 * Script to set up the first admin user
 * Usage: node scripts/setup-admin.js --email admin@example.com --key YOUR_SETUP_KEY
 */

const https = require('https');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('Dynasty Admin Setup\n');
  console.log('This script will grant admin privileges to an existing user.');
  console.log('Make sure the user has already signed up and verified their account.\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const emailIndex = args.indexOf('--email');
  const keyIndex = args.indexOf('--key');
  const envIndex = args.indexOf('--env');
  
  let email = emailIndex > -1 ? args[emailIndex + 1] : null;
  let setupKey = keyIndex > -1 ? args[keyIndex + 1] : null;
  let environment = envIndex > -1 ? args[envIndex + 1] : 'production';

  // Prompt for missing values
  if (!email) {
    email = await question('Enter the email address of the user to make admin: ');
  }

  if (!setupKey) {
    setupKey = await question('Enter the admin setup key from your environment variables: ');
  }

  // Confirm
  console.log(`\nEnvironment: ${environment}`);
  console.log(`Email: ${email}`);
  const confirm = await question('\nProceed with granting admin privileges? (yes/no): ');
  
  if (confirm.toLowerCase() !== 'yes') {
    console.log('Setup cancelled.');
    process.exit(0);
  }

  // Determine the functions URL based on environment
  let functionsUrl;
  switch (environment) {
    case 'local':
      functionsUrl = 'http://localhost:5001/dynasty-dev-1b042/us-central1';
      break;
    case 'development':
      functionsUrl = 'https://us-central1-dynasty-dev-1b042.cloudfunctions.net';
      break;
    case 'production':
      functionsUrl = 'https://us-central1-dynasty-eba63.cloudfunctions.net';
      break;
    default:
      console.error('Invalid environment. Use: local, development, or production');
      process.exit(1);
  }

  // Make the request
  const data = JSON.stringify({ email, setupKey });
  const url = new URL(`${functionsUrl}/initializeFirstAdmin`);
  
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  console.log('\nSending request...');

  const req = (url.protocol === 'https:' ? https : require('http')).request(options, (res) => {
    let responseData = '';

    res.on('data', (chunk) => {
      responseData += chunk;
    });

    res.on('end', () => {
      try {
        const response = JSON.parse(responseData);
        
        if (res.statusCode === 200 && response.result?.success) {
          console.log('\n✅ Success! Admin privileges granted.');
          console.log(`\nThe user ${email} now has admin access.`);
          console.log('\nNext steps:');
          console.log('1. Have the user sign in at https://admin.yourdomain.com');
          console.log('2. They will need to enable 2FA if not already done');
          console.log('3. All admin actions will be logged for security');
        } else {
          console.error('\n❌ Error:', response.error?.message || 'Unknown error');
          if (response.error?.message?.includes('Admin already exists')) {
            console.log('\nAn admin user already exists. Use the admin dashboard to manage additional admins.');
          }
        }
      } catch (error) {
        console.error('\n❌ Failed to parse response:', responseData);
      }
      
      rl.close();
    });
  });

  req.on('error', (error) => {
    console.error('\n❌ Request failed:', error.message);
    rl.close();
  });

  req.write(data);
  req.end();
}

main().catch(error => {
  console.error('Script error:', error);
  rl.close();
  process.exit(1);
});