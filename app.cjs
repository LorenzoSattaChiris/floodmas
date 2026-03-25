/**
 * Passenger / Plesk production entry point (CommonJS).
 *
 * Phusion Passenger internally uses require() to load the startup file.
 * Since package.json has "type": "module", plain .js files are ESM and
 * cannot be loaded via require().  A .cjs extension forces CommonJS mode
 * regardless of the package type, working around the compatibility issue.
 *
 * Plesk settings:
 *   Application Root            →  /httpdocs
 *   Application Startup File    →  app.cjs
 *   Document Root               →  /httpdocs/public  (or /httpdocs)
 */

import('./dist/index.js').catch(function (err) {
  console.error('FloodMAS server failed to start:', err);
  process.exit(1);
});
