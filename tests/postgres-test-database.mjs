import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

const server = {
 host: process.env.POSTGRES_HOST || '127.0.0.1',
 port: Number(process.env.POSTGRES_PORT || 5432),
 user: process.env.POSTGRES_USER || 'postgres',
 password: process.env.POSTGRES_PASSWORD || '',
};

// Creates an isolated database from db/postgres/schema.sql and points lib/db.ts at it.
// With `tables`, every other table is dropped so the code under test has to create it at runtime.
export async function createTestDatabase(prefix, tables) {
 const name = `${prefix}_${randomBytes(6).toString('hex')}`;
 const admin = new pg.Client({ ...server, database: process.env.POSTGRES_DATABASE || 'clickme' });
 await admin.connect();
 await admin.query(`CREATE DATABASE ${name}`);
 const setup = new pg.Client({ ...server, database: name });
 try {
  await setup.connect();
  await setup.query(readFileSync(new URL('../db/postgres/schema.sql', import.meta.url), 'utf8'));
  if (tables) {
   const { rows } = await setup.query("SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'");
   const extra = rows.map(row => row.table_name).filter(table => !tables.includes(table));
   if (extra.length) await setup.query(`DROP TABLE ${extra.join(', ')} CASCADE`);
  }
  await setup.end();
 } catch (error) {
  await setup.end().catch(() => {});
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
  throw error;
 }
 process.env.POSTGRES_DATABASE = name;
 return {
  name,
  async drop() {
   await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
   await admin.end();
  },
 };
}
