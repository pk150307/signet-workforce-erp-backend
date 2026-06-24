import { runMigrations } from '../database/migrate';
import { seedDatabase } from '../database/seed';
import { pool, checkDatabaseConnection } from '../database/pool';
import { seedAuthUser } from '../scripts/seed-auth';
import { seedTestHrManager } from './helpers/test-seed';

let dbReady = false;

beforeAll(async () => {
  const connected = await checkDatabaseConnection();
  if (!connected) {
    console.warn(
      '[jest] Database unavailable — integration tests require a running Postgres instance. ' +
        'Configure DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD in the project .env file.',
    );
    return;
  }

  await runMigrations();
  await seedDatabase();
  await seedAuthUser();
  await seedTestHrManager();
  dbReady = true;
}, 120000);

beforeEach(() => {
  if (!dbReady) {
    pending('Database unavailable — skipping integration test');
  }
});


afterAll(async () => {
  await pool.end();
});
