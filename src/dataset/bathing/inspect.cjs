const fs = require('fs');
const path = require('path');
const dir = __dirname;

// Load site.csv
const siteText = fs.readFileSync(path.join(dir, 'site.csv'), 'utf8');
const siteLines = siteText.split(/\r?\n/).filter(l => l.trim());
console.log('=== SITE ===');
console.log('Rows:', siteLines.length - 1);
console.log('Header:', siteLines[0]);

// Load classifications.csv
const clText = fs.readFileSync(path.join(dir, 'classifications.csv'), 'utf8');
const clLines = clText.split(/\r?\n/).filter(l => l.trim());
console.log('\n=== CLASSIFICATIONS ===');
console.log('Rows:', clLines.length - 1);
console.log('Header:', clLines[0]);
console.log('Sample:', clLines[1]);

// Parse latest classification per EUBWID
const latest = {};
for (let i = 1; i < clLines.length; i++) {
  const p = clLines[i].split(',');
  const id = p[0];
  const yr = parseInt(p[2]);
  const cl = p[3];
  const regime = p[4];
  const type = p[5];
  if (!latest[id] || yr > latest[id].year) {
    latest[id] = { year: yr, classification: cl, regime, type };
  }
}
console.log('Unique BWs:', Object.keys(latest).length);
const dist = {};
for (const v of Object.values(latest)) {
  const key = v.classification;
  dist[key] = (dist[key] || 0) + 1;
}
console.log('Latest classification distribution:');
for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

// Check regimes in latest
const regimeDist = {};
for (const v of Object.values(latest)) {
  regimeDist[v.regime] = (regimeDist[v.regime] || 0) + 1;
}
console.log('Latest regimes:', regimeDist);
console.log('Example years:', Object.values(latest).slice(0, 3).map(v => v.year));

// Load samples.csv header
const sampText = fs.readFileSync(path.join(dir, 'samples.csv'), 'utf8');
const sampLines = sampText.split(/\r?\n/).filter(l => l.trim());
console.log('\n=== SAMPLES ===');
console.log('Rows:', sampLines.length - 1);
console.log('Header:', sampLines[0]);

// Count unique BWs in samples
const sampBWs = new Set();
for (let i = 1; i < Math.min(sampLines.length, 50000); i++) {
  const id = sampLines[i].split(',')[0];
  sampBWs.add(id);
}
console.log('Unique BWs in first 50K samples:', sampBWs.size);

// Load prf.csv header
const prfText = fs.readFileSync(path.join(dir, 'prf.csv'), 'utf8');
const prfLines = prfText.split(/\r?\n/).filter(l => l.trim());
console.log('\n=== PRF (Pollution Risk Forecasts) ===');
console.log('Rows:', prfLines.length - 1);
console.log('Header:', prfLines[0]);

// as.csv
const asText = fs.readFileSync(path.join(dir, 'as.csv'), 'utf8');
const asLines = asText.split(/\r?\n/).filter(l => l.trim());
console.log('\n=== AS (Abnormal Situations/Suspensions) ===');
console.log('Rows:', asLines.length - 1);
console.log('Header:', asLines[0]);

// Summary
console.log('\n=== SUMMARY ===');
console.log('460 bathing waters with lat/long in site.csv');
console.log('All have coordinates - no geocoding needed');
console.log('Best approach: join site + latest classification for point layer');
console.log('Color by classification: Excellent/Good/Sufficient/Poor');
