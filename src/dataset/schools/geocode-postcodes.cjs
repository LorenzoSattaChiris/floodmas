/**
 * One-time script: geocode unique postcodes from the schools CSV
 * using postcodes.io bulk API, then save a JSON mapping file.
 *
 * Usage: node geocode-postcodes.cjs
 * Output: postcode-coords.json  — { "SW1A 1AA": [lon, lat], ... }
 */
const fs = require('fs');

const CSV_FILE = 'edubaseallstatefunded20260325.csv';
const OUT_FILE = 'postcode-coords.json';
const BATCH_SIZE = 100;
const CONCURRENCY = 5;

function splitCSVRow(row) {
  const result = [];
  let current = '', inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

async function main() {
  const raw = fs.readFileSync(CSV_FILE, 'utf8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  const headers = splitCSVRow(lines[0]).map(h => h.trim());
  const statusIdx = headers.indexOf('EstablishmentStatus (name)');
  const postcodeIdx = headers.indexOf('Postcode');

  // Collect unique postcodes from open schools
  const postcodes = new Set();
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCSVRow(lines[i]);
    if (vals[statusIdx] !== 'Open') continue;
    const pc = (vals[postcodeIdx] || '').trim();
    if (pc) postcodes.add(pc);
  }

  console.log(`Found ${postcodes.size} unique postcodes from open schools`);

  const pcArray = Array.from(postcodes);
  const batches = [];
  for (let i = 0; i < pcArray.length; i += BATCH_SIZE) {
    batches.push(pcArray.slice(i, i + BATCH_SIZE));
  }
  console.log(`Processing ${batches.length} batches of ${BATCH_SIZE}...`);

  const mapping = {};
  let done = 0;

  // Process batches with limited concurrency
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(async (batch) => {
      const res = await fetch('https://api.postcodes.io/postcodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postcodes: batch }),
      });
      if (!res.ok) throw new Error(`postcodes.io returned ${res.status}`);
      return res.json();
    }));

    for (const data of results) {
      for (const item of data.result || []) {
        if (item.result) {
          mapping[item.query] = [
            Math.round(item.result.longitude * 1e6) / 1e6,
            Math.round(item.result.latitude * 1e6) / 1e6,
          ];
        }
      }
    }
    done += chunk.length;
    process.stdout.write(`\r  ${done}/${batches.length} batches done (${Object.keys(mapping).length} geocoded)`);
  }

  console.log(`\nGeocoded ${Object.keys(mapping).length} / ${postcodes.size} postcodes`);
  fs.writeFileSync(OUT_FILE, JSON.stringify(mapping));
  const size = fs.statSync(OUT_FILE).size;
  console.log(`Wrote ${OUT_FILE} (${(size / 1024).toFixed(0)} KB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
