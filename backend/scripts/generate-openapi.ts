import fs from 'fs';
import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';
import { config } from '../config';

const backendRoot = path.resolve(__dirname, '../..');
const srcRoot = path.join(backendRoot, 'src');
const outputPath = path.join(srcRoot, 'config', 'openapi.generated.json');

const spec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Signet Workforce ERP API',
      version: '1.0.0',
      description:
        'Production REST API for Signet Workforce ERP. Authenticate via POST /api/auth/login, then use the Bearer token for protected routes.',
    },
    servers: [{ url: `http://localhost:${config.port}`, description: 'Local' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [
    path.join(srcRoot, 'modules/**/*.routes.ts'),
    path.join(srcRoot, 'docs/**/*.ts'),
  ],
}) as { paths?: Record<string, unknown> };

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');

const pathCount = Object.keys(spec.paths ?? {}).length;
console.log(`OpenAPI spec written to ${outputPath} (${pathCount} paths)`);
