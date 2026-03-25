const fs = require('fs');
const lines = fs.readFileSync('edubaseallstatefunded20260325.csv', 'utf8').split(/\r?\n/);
const hdr = lines[0];
const cols = [];
let cur = '', inQ = false;
for (let i = 0; i < hdr.length; i++) {
  const c = hdr[i];
  if (c === '"') { inQ = !inQ; }
  else if (c === ',' && !inQ) { cols.push(cur); cur = ''; }
  else { cur += c; }
}
cols.push(cur);
cols.forEach((c, i) => console.log((i + 1) + ': ' + c));
console.log('Total columns:', cols.length);

// Show sample row
const row1 = lines[1];
const vals = [];
cur = ''; inQ = false;
for (let i = 0; i < row1.length; i++) {
  const c = row1[i];
  if (c === '"') { inQ = !inQ; }
  else if (c === ',' && !inQ) { vals.push(cur); cur = ''; }
  else { cur += c; }
}
vals.push(cur);
console.log('\n--- Sample row ---');
cols.forEach((c, i) => console.log((i + 1) + ' ' + c + ': ' + (vals[i] || '')));

// Count open schools
let openCount = 0;
const statusIdx = cols.indexOf('EstablishmentStatus (name)');
for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const v = [];
  let c2 = '', q = false;
  for (let j = 0; j < lines[i].length; j++) {
    const ch = lines[i][j];
    if (ch === '"') { q = !q; }
    else if (ch === ',' && !q) { v.push(c2); c2 = ''; }
    else { c2 += ch; }
  }
  v.push(c2);
  if (v[statusIdx] === 'Open') openCount++;
}
console.log('\nOpen schools:', openCount);
console.log('Total data rows:', lines.filter(l => l.trim()).length - 1);
