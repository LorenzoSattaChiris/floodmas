/**
 * Passenger / production entry point.
 *
 * Phusion Passenger (Plesk) runs plain Node.js and cannot handle TypeScript
 * directly. This wrapper spawns Node with the --import tsx flag, which
 * registers tsx as the ESM loader so .ts files and .js→.ts extension
 * mapping work at runtime.
 *
 * Plesk settings:
 *   Application Root            →  /httpdocs
 *   Application Startup File    →  app.js
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const child = spawn(
  process.execPath,
  ['--import', 'tsx', join(__dirname, 'src', 'index.ts')],
  { stdio: 'inherit', env: process.env }
);

// Forward signals so Passenger can gracefully stop the server
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
child.on('exit', (code) => process.exit(code ?? 0));
