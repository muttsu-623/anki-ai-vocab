#!/usr/bin/env node

import * as dotenv from 'dotenv';

// Load .env file
dotenv.config();

console.log('Checking environment variables:');
console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'Set' : 'Not set'}`);
console.log(`AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? 'Set' : 'Not set'}`);
console.log(`AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? 'Set' : 'Not set'}`);
console.log(`AWS_DEFAULT_REGION: ${process.env.AWS_DEFAULT_REGION || 'Not set'}`);

// Show first few characters of keys if set (for debugging)
if (process.env.AWS_ACCESS_KEY_ID) {
  console.log(`AWS_ACCESS_KEY_ID starts with: ${process.env.AWS_ACCESS_KEY_ID.substring(0, 4)}...`);
}
if (process.env.AWS_SECRET_ACCESS_KEY) {
  console.log(`AWS_SECRET_ACCESS_KEY is ${process.env.AWS_SECRET_ACCESS_KEY.length} characters long`);
}