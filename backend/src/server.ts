import { createApp } from './app';
import { config } from './config';
import { connectDB, pool } from './database';
import { runMigrations } from './database/migrate';
import { seedDatabase } from './database/seed';
import { logger, logUncaughtExceptions } from './utils/logger';

async function bootstrap(): Promise<void> {
  logUncaughtExceptions();

  console.log('[startup] Signet Workforce ERP API bootstrapping...');
  logger.info('Starting Signet Workforce ERP API');

  await connectDB();
  await runMigrations();
  await seedDatabase();

  const app = createApp();

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(config.port, '0.0.0.0', () => {
      console.log(`[startup] Server listening on 0.0.0.0:${config.port}`);
      logger.info(`Server listening on port ${config.port}`, {
        env: config.nodeEnv,
        docs: config.isProduction ? undefined : `http://localhost:${config.port}/swagger`,
      });
      resolve();
    });
    server.on('error', reject);
  });
}

bootstrap().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[startup] FATAL:', message);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  logger.error('Startup failed', {
    error: message,
    stack: error instanceof Error ? error.stack : undefined,
  });
  await pool.end().catch(() => undefined);
  process.exit(1);
});
