import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read env from .env.local
const envFile = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) env[key.trim()] = rest.join('=').trim();
});

let databaseUrl = env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Missing DATABASE_URL in .env.local');
  process.exit(1);
}

// Fix password brackets if present (Supabase shows password in [brackets])
databaseUrl = databaseUrl.replace(/:\[([^\]]+)\]@/, ':$1@');

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

try {
  console.log('Connecting to database...');
  await client.connect();
  console.log('Connected.');

  const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');
  const migrationFiles = readdirSync(migrationsDir)
    .filter(name => name.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    console.log(`Running migration: ${file}`);
    await client.query(sql);
  }

  console.log('All migrations completed successfully!');

  // Verify tables
  const { rows } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  console.log('Tables created:', rows.map(r => r.table_name).join(', '));
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
