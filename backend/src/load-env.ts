import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
];

let loadedFrom: string | null = null;

for (const envPath of envCandidates) {
  if (!fs.existsSync(envPath)) {
    continue;
  }
  dotenv.config({ path: envPath, override: false });
  loadedFrom ??= envPath;
}

export const envFilePath = loadedFrom;
