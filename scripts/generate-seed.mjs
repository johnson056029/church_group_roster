import fs from 'node:fs';
import { toRecords } from '../src/records.js';
const seed = JSON.parse(fs.readFileSync('src/seed.json', 'utf8'));
const rows = toRecords(seed.defaultState, seed.users);
const quote = value => value == null ? 'null' : "'" + String(value).replaceAll("'", "''") + "'";
// Parent tables first; existing data is never overwritten by rerunning the seed.
rows.sort((a, b) => (a.table === 'members' ? 0 : a.table === 'groups' ? 1 : 2) - (b.table === 'members' ? 0 : b.table === 'groups' ? 1 : 2));
fs.writeFileSync('supabase/seed.sql', '-- Synthetic demo seed. Run after 001_schema.sql.\nbegin;\n' + rows.map(row => `insert into public.${row.table} (id,group_id,member_id,data) values (${quote(row.id)},${quote(row.group_id)},${quote(row.member_id)},${quote(JSON.stringify(row.data))}::jsonb) on conflict (id) do nothing;`).join('\n') + '\ncommit;\n');
