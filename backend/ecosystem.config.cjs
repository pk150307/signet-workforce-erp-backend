/** PM2 process manager config — run from backend/: pm2 start ecosystem.config.cjs */
const path = require('path');

const envFiles = [
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env'),
];

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
        DOTENV_CONFIG_PATH: envFiles.find((file) => require('fs').existsSync(file)) ?? envFiles[0],
      },
    },
  ],
};
