/** PM2 process manager config — run from backend/: pm2 start ecosystem.config.cjs */
const fs = require('fs');
const path = require('path');

const envFiles = [
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env'),
];

function parseEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) {
    return env;
  }

  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

const dotenvPath = envFiles.find((file) => fs.existsSync(file)) ?? envFiles[0];
const fileEnv = parseEnvFile(dotenvPath);

module.exports = {
  apps: [
    {
      name: 'workforce-api',
      script: './dist/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      listen_timeout: 30000,
      kill_timeout: 5000,
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      node_args: '-r dotenv/config',
      env: {
        NODE_ENV: 'production',
        DOTENV_CONFIG_PATH: dotenvPath,
        ...fileEnv,
      },
    },
  ],
};
