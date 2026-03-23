/**
 * Passenger / Plesk production entry point.
 *
 * Phusion Passenger runs plain Node.js — it cannot handle TypeScript.
 * This file simply imports the pre-compiled JavaScript output from dist/.
 *
 * The TypeScript source is compiled automatically via the postinstall
 * script in package.json (runs `tsc` after every `npm install`).
 *
 * Plesk settings:
 *   Application Root            →  /httpdocs
 *   Application Startup File    →  app.js
 */

import './dist/index.js';
