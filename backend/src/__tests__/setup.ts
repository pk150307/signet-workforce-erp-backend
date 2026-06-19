import { runMigrations } from '../database/migrate';
import { seedDatabase } from '../database/seed';
import { pool } from '../database/pool';

beforeAll(async () => {
  await runMigrations();
  await seedDatabase();
}, 60000);

afterAll(async () => {
  await pool.end();
});
