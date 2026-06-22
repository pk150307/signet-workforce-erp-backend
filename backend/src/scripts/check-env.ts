import net from 'net';
import { config } from '../config';
import { connectDB } from '../database';

const MIN_NODE = 20;

async function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function main(): Promise<void> {
  const nodeMajor = parseInt(process.version.slice(1).split('.')[0] ?? '0', 10);
  if (nodeMajor < MIN_NODE) {
    console.error(`\n❌ Node.js ${MIN_NODE}+ required (current: ${process.version}).`);
    console.error('   Run: nvm use 22\n');
    process.exit(1);
  }

  if (!(await isPortFree(config.port))) {
    console.error(`\n❌ Port ${config.port} is already in use.`);
    console.error('   Stop the other process or change PORT in .env\n');
    process.exit(1);
  }

  try {
    await connectDB();
  } catch {
    console.error('\n❌ Cannot connect to PostgreSQL.');
    console.error(`   Host: ${config.db.host}:${config.db.port}`);
    console.error(`   Database: ${config.db.name}`);
    console.error('   Tips:');
    console.error('   - Start Postgres (docker compose up postgres -d)');
    console.error('   - Use DB_HOST=127.0.0.1 in .env (not localhost on macOS)');
    console.error('   - Verify credentials in .env match your Postgres setup\n');
    process.exit(1);
  }

  console.log(`✓ Environment OK (Node ${process.version}, DB connected, port ${config.port} free)`);
}

main().catch((err) => {
  console.error('Startup check failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
