import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params);
  } catch (error) {
    logger.error('Database query failed', {
      error: error instanceof Error ? error.message : String(error),
      query: text,
    });
    throw error;
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connectDB(maxRetries = 5, retryDelayMs = 3000): Promise<void> {
  const { host, port, name, user } = config.db;

  if (config.isProduction && (host === 'localhost' || host === 'signet-workforce-db.cnkkq6k8a3gr.ap-south-1.rds.amazonaws.com')) {
    console.warn(
      '[startup] WARNING: DB_HOST is localhost in production — set DB_HOST to your RDS endpoint in .env',
    );
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `[startup] Connecting to database (attempt ${attempt}/${maxRetries}) at ${host}:${port}/${name}...`,
      );
      logger.info('Connecting to database...', { host, port, database: name, user, attempt, maxRetries });

      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }

      console.log('[startup] Database connected successfully');
      logger.info('Database connected successfully');
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[startup] Database connection attempt ${attempt}/${maxRetries} failed: ${message}`);
      logger.error('Database connection attempt failed', {
        error: message,
        host,
        port,
        database: name,
        user,
        attempt,
        maxRetries,
      });

      if (attempt < maxRetries) {
        await sleep(retryDelayMs);
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  console.error(`[startup] Database connection failed after ${maxRetries} attempts: ${message}`);
  throw lastError;
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
