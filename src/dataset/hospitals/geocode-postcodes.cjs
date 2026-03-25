/**
 * One-time script: geocode unique postcodes from the CQC directory CSV
 * using postcodes.io bulk API, then save a JSON mapping file.
 *
 * Usage: node geocode-postcodes.cjs
 * Output: postcode-coords.json  — { "SW1A 1AA": [lon, lat], ... }
 */
const fs = require('fs');

const CSV_FILE = '18_March_2026_CQC_directory.csv';
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

  // Find the header row
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    if (lines[i].startsWith('Name,') || lines[i].startsWith('"Name"')) {
      headerIdx = i;
      break;
    }
  }
  const headers = splitCSVRow(lines[headerIdx]).map(h => h.trim());
  const postcodeIdx = headers.indexOf('Postcode');

  // Collect unique postcodes
  const postcodes = new Set();
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const vals = splitCSVRow(lines[i]);
    const pc = (vals[postcodeIdx] || '').trim();
    if (pc) postcodes.add(pc);
  }

  // Check if schools postcode-coords.json exists and reuse
  const schoolsCoordsPath = '../schools/postcode-coords.json';
  let existing = {};
  if (fs.existsSync(schoolsCoordsPath)) {
    existing = JSON.parse(fs.readFileSync(schoolsCoordsPath, 'utf8'));
    console.log(`Loaded ${Object.keys(existing).length} existing coords from schools dataset`);
  }

  // Filter out already-geocoded postcodes
  const needed = [];
  const mapping = {};
  for (const pc of postcodes) {
    if (existing[pc]) {
      mapping[pc] = existing[pc];
    } else {
      needed.push(pc);
    }
  }
  console.log(`Found ${postcodes.size} unique postcodes, ${mapping ? Object.keys(mapping).length : 0} reused, ${needed.length} to geocode`);

  const batches = [];
  for (let i = 0; i < needed.length; i += BATCH_SIZE) {
    batches.push(needed.slice(i, i + BATCH_SIZE));
  }
  console.log(`Processing ${batches.length} batches of ${BATCH_SIZE}...`);

  let done = 0;
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
