const fs = require('fs');
const CSV_FILE = '18_March_2026_CQC_directory.csv';

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

const raw = fs.readFileSync(CSV_FILE, 'utf8');
const lines = raw.split(/\r?\n/).filter(l => l.trim());

// Find the header row (contains "Name" as first col)
let headerIdx = -1;
for (let i = 0; i < Math.min(10, lines.length); i++) {
  if (lines[i].startsWith('Name,') || lines[i].startsWith('"Name"')) {
    headerIdx = i;
    break;
  }
}
console.log('Header row index:', headerIdx);
const headers = splitCSVRow(lines[headerIdx]).map(h => h.trim());
console.log('Columns:', headers.length);
headers.forEach((h, i) => console.log(`  ${i + 1}: ${h}`));

const dataLines = lines.slice(headerIdx + 1);
console.log('\nTotal data rows:', dataLines.length);

// Count service types
const typeCounts = {};
for (const line of dataLines) {
  const vals = splitCSVRow(line);
  const types = (vals[6] || '').split('|').map(t => t.trim()).filter(Boolean);
  for (const t of types) {
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
}
console.log('\nService types:');
Object.entries(typeCounts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([t, c]) => console.log(`  ${c}\t${t}`));

// Count postcodes
let withPostcode = 0, withoutPostcode = 0;
const uniquePostcodes = new Set();
for (const line of dataLines) {
  const vals = splitCSVRow(line);
  const pc = (vals[3] || '').trim();
  if (pc) { withPostcode++; uniquePostcodes.add(pc); }
  else withoutPostcode++;
}
console.log(`\nWith postcode: ${withPostcode}, without: ${withoutPostcode}`);
console.log(`Unique postcodes: ${uniquePostcodes.size}`);
