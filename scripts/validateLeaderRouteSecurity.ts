import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/)
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')];
  }));
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Supabase public configuration is missing.');

async function main() {
const supabase = createClient(url, key, { auth: { persistSession: false } });
const read = await supabase.from('trip_route_points').select('trip_id').limit(1);
const write = await supabase.from('trip_route_points').insert({
  trip_id: '00000000-0000-0000-0000-000000000000', route_version: 1, sequence: 1,
  sample_id: '00000000-0000-0000-0000-000000000001', latitude: 0, longitude: 0,
  cumulative_distance_meters: 0, sampled_at: new Date().toISOString(),
});
const endpoint = `${url}/functions/v1/send-lag-alert`;
const missing = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
const wrong = await fetch(endpoint, { method: 'POST', headers: {
  'content-type': 'application/json', 'x-triptrack-webhook-secret': 'incorrect-test-value',
}, body: '{}' });

console.log(JSON.stringify({
  anonymousReadHidden: !read.error && (read.data?.length ?? 0) === 0,
  anonymousWriteRejected: Boolean(write.error),
  missingSecretStatus: missing.status,
  wrongSecretStatus: wrong.status,
}));
}

void main();
