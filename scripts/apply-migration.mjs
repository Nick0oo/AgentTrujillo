import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const projectRef = 'yapjiinrjsrothzgzxsv';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const sql = fs.readFileSync('supabase/migrations/20260925170000_system_terms_and_ai_consent.sql', 'utf8');

console.log('Applying migration via Supabase Management API...');
const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ query: sql })
});

console.log('Status:', res.status, res.statusText);
const body = await res.text();
console.log('Response body:', body);
