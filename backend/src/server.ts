import { createApp } from './app';
import { config } from './config';
import { getStorageDiagnostics } from './config/s3';
import { connectDB, pool } from './database';
import { runMigrations } from './database/migrate';
import { seedDatabase } from './database/seed';
import { logger, logUncaughtExceptions } from './utils/logger';

async function bootstrap(): Promise<void> {
  logUncaughtExceptions();

  console.log('[startup] 🚀 Bootstrapping Signet Workforce ERP API...');
  logger.info('Starting Signet Workforce ERP API');

  try {
    // ---------------------------
    // 1. DB CONNECTION
    // ---------------------------
    console.log('[startup] 🔌 Connecting to database...');
    await connectDB();
    console.log('[startup] ✅ Database connected');

    // ---------------------------
    // 2. MIGRATIONS (with safety timeout)
    // ---------------------------
    console.log('[startup] ⚙️ Running migrations...');
    await Promise.race([
      runMigrations(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Migrations timeout (60s)')), 60000)
      ),
    ]);
    console.log('[startup] ✅ Migrations completed');

    // ---------------------------
    // 3. SEEDING (with safety timeout)
    // ---------------------------
    console.log('[startup] 🌱 Seeding database...');
    await Promise.race([
      seedDatabase(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Seeding timeout (60s)')), 60000)
      ),
    ]);
    console.log('[startup] ✅ Seeding completed');

    const storage = getStorageDiagnostics();
    console.log(`[startup] 📦 File storage: ${storage.backend.toUpperCase()}`);
    if (storage.backend === 's3') {
      console.log(`[startup]    bucket=${storage.bucket} region=${storage.region}`);
    } else if (config.isProduction) {
      console.warn('[startup] ⚠️  Production is using local disk storage — set AWS_* env vars for S3');
      if (storage.missingEnv.length > 0) {
        console.warn(`[startup]    missing: ${storage.missingEnv.join(', ')}`);
      }
    }

    // ---------------------------
    // 4. CREATE APP
    // ---------------------------
    console.log('[startup] 🧩 Creating app...');
    const app = createApp();

    // ---------------------------
    // 5. START SERVER
    // ---------------------------
    await new Promise<void>((resolve, reject) => {
      const server = app.listen(config.port, '0.0.0.0', () => {
        console.log(`[startup] 🌐 Server listening on 0.0.0.0:${config.port}`);

        logger.info('Server started successfully', {
          port: config.port,
          env: config.nodeEnv,
          docs: config.isProduction
            ? undefined
            : `http://localhost:${config.port}/swagger`,
        });

        resolve();
      });

      server.on('error', (err) => {
        console.error('[startup] ❌ Server failed to start:', err);
        reject(err);
      });
    });

  } catch (error) {
    console.error('[startup] ❌ Bootstrap failed:', error);

    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
    });

    try {
      await pool.end();
    } catch (e) {
      console.error('[startup] ⚠️ Failed to close DB pool:', e);
    }

    process.exit(1);
  }
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
