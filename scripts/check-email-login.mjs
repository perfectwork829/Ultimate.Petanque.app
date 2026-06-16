import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(root, '.env');

if (!fs.existsSync(envPath)) {
  console.log('SKIP: no .env file');
  process.exit(0);
}

for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq < 0) continue;
  const k = trimmed.slice(0, eq);
  let v = trimmed.slice(eq + 1);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (k === 'EXPO_PUBLIC_SUPABASE_URL' || k === 'EXPO_PUBLIC_SUPABASE_ANON_KEY') {
    process.env[k] = v;
  }
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.log('SKIP: Supabase env vars missing');
  process.exit(0);
}

const client = createClient(url, key);
const cases = [
  ['alice@test.com', 'TestSeed123!', 'seed user lowercase'],
  ['ALICE@TEST.COM', 'TestSeed123!', 'seed user uppercase email'],
  ['alice@test.com', 'wrong-password', 'wrong password'],
];

for (const [email, password, label] of cases) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    console.log(`${label}: ERROR — ${error.message}`);
  } else {
    console.log(`${label}: OK — ${data.user?.email}`);
  }
  await client.auth.signOut();
}
