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

// Ensure Passenger/Plesk always sees production behaviour
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

import('./dist/index.js').catch(function (err) {
  // Log to stderr so it appears in Plesk error_log
  console.error('FloodMAS server failed to start:', err);
  // Do NOT call process.exit() — let Passenger detect the failure itself.
  // Exiting prematurely prevents Passenger from writing diagnostic info.
});
