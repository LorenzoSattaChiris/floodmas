// Flood keywords and UK location terms for Bluesky search queries

export const FLOOD_TERMS = [
  'flood', 'flooding', 'flooded', 'floodwater', 'floodplain',
  'deluge', 'inundation', 'waterlogged', 'submerged',
  'storm surge', 'river burst', 'flash flood', 'flood warning',
  'flood alert', 'rising water', 'sandbag', 'embankment breach',
];

export const UK_LOCATIONS = [
  'UK', 'England', 'Scotland', 'Wales',
  'London', 'Manchester', 'York', 'Leeds', 'Sheffield',
  'Bristol', 'Carlisle', 'Newcastle', 'Oxford', 'Exeter',
  'Birmingham', 'Liverpool', 'Glasgow', 'Edinburgh', 'Cardiff',
  'Belfast', 'Cornwall', 'Devon', 'Somerset', 'Norfolk',
  'Suffolk', 'Kent', 'Cumbria', 'Yorkshire', 'Lancashire',
  'Thames', 'Severn', 'Trent', 'Ouse', 'Mersey',
  'Tyne', 'Avon', 'Dee', 'Wye', 'Exe',
];

/**
 * Build a Bluesky search query combining flood terms with UK locations.
 * Bluesky uses simple text matching, so we create a compact query.
 */
export function buildSearchQuery(): string {
  // Bluesky search supports basic OR-style matching via space-separated terms
  // We pick high-signal combinations to stay within reasonable query length
  const terms = [
    'flood UK',
    'flooding England',
    'flooding Wales',
    'flooding Scotland',
    'flood warning',
    'flood alert',
    'river flooding UK',
    'flash flood UK',
    'storm surge UK',
  ];
  // Bluesky searchPosts uses the `q` param; OR logic is implicit for multi-word
  // Best strategy: use a focused query that captures most relevant posts
  return 'flood UK OR flooding England OR flooding Wales OR flooding Scotland OR "flood warning" OR "flood alert"';
}
