import { createApp } from './app';
import { config } from './config';
import { runMigrations } from './database/migrate';
import { seedDatabase } from './database/seed';
import { pool } from './database/pool';
import { logger, logUncaughtExceptions } from './utils/logger';

async function bootstrap(): Promise<void> {
  logUncaughtExceptions();

  logger.info('Starting Signet Workforce ERP API');

  await runMigrations();
  await seedDatabase();

  const app = createApp();

  app.listen(config.port, () => {
    logger.info(`Server listening on port ${config.port}`, {
      env: config.nodeEnv,
      docs: config.isProduction ? undefined : `http://localhost:${config.port}/swagger`,
    });
  });
}

bootstrap().catch(async (error) => {
  logger.error('Failed to start server', { error: error instanceof Error ? error.message : String(error) });
  await pool.end();
  process.exit(1);
});
