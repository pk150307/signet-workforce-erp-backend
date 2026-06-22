import { createApp } from './app';
import { config } from './config';
import { connectDB, pool } from './database';
import { runMigrations } from './database/migrate';
import { seedDatabase } from './database/seed';
import { logger, logUncaughtExceptions } from './utils/logger';

async function bootstrap(): Promise<void> {
  try {
    logUncaughtExceptions();

    logger.info('Starting Signet Workforce ERP API');

    await connectDB();
    await runMigrations();
    await seedDatabase();

    const app = createApp();

    app.listen(config.port, () => {
      logger.info(`Server listening on port ${config.port}`, {
        env: config.nodeEnv,
        docs: config.isProduction ? undefined : `http://localhost:${config.port}/swagger`,
      });
    });
  } catch (error) {
    logger.error('Startup failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    await pool.end();
    process.exit(1);
  }
}

bootstrap();
