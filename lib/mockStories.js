export const mockStoryClusters = [
  {
    id: 'national-grid',
    title: 'Federal agencies announce new grid resilience funding',
    locationName: 'United States',
    level: 'national',
    coordinates: [-98.5795, 39.8283],
    topic: 'Infrastructure',
    updatedAt: 'Today',
    summary: 'A national infrastructure package is directing new resilience funding toward power grid upgrades, emergency preparation, and state-level implementation planning. This mock cluster shows how broad federal stories appear while zoomed out.',
    sourceCount: 5,
    sources: [
      { title: 'Federal grid resilience funds announced', outlet: 'Public Source Wire', url: 'https://example.com/federal-grid' },
      { title: 'States prepare energy infrastructure proposals', outlet: 'Civic Ledger', url: 'https://example.com/state-grid' },
      { title: 'What the grid package could mean locally', outlet: 'Policy Desk', url: 'https://example.com/grid-local' }
    ]
  },
  {
    id: 'southeast-storms',
    title: 'Southeast cities prepare for severe storm season',
    locationName: 'Southeast U.S.',
    level: 'regional',
    coordinates: [-84.388, 33.749],
    topic: 'Weather / Preparedness',
    updatedAt: '2 hours ago',
    summary: 'Emergency managers across several Southeastern states are updating response plans and shelter guidance ahead of expected severe weather. This represents regional coverage surfaced before the user zooms to one state or city.',
    sourceCount: 4,
    sources: [
      { title: 'Southeast storm preparation ramps up', outlet: 'Regional Bulletin', url: 'https://example.com/se-storms' },
      { title: 'Emergency managers coordinate across state lines', outlet: 'Metro South News', url: 'https://example.com/emergency' }
    ]
  },
  {
    id: 'montana-housing',
    title: 'Montana communities debate housing supply and zoning changes',
    locationName: 'Montana',
    level: 'state',
    coordinates: [-110.3626, 46.8797],
    topic: 'Housing / Policy',
    updatedAt: 'Today',
    summary: 'State and local officials are weighing housing reforms aimed at expanding supply while preserving community character. In the real product, this card would synthesize up to five relevant source articles.',
    sourceCount: 5,
    sources: [
      { title: 'Montana housing reforms move through committees', outlet: 'Mountain State Journal', url: 'https://example.com/mt-housing-1' },
      { title: 'Cities consider zoning tools as demand grows', outlet: 'Big Sky Civic News', url: 'https://example.com/mt-housing-2' },
      { title: 'Builders and residents split on density proposals', outlet: 'Flathead Public Radio', url: 'https://example.com/mt-housing-3' }
    ]
  },
  {
    id: 'kalispell-development',
    title: 'Kalispell reviews neighborhood development proposal',
    locationName: 'Kalispell, MT',
    level: 'city',
    coordinates: [-114.3168, 48.1919],
    topic: 'Local Development',
    updatedAt: '48 minutes ago',
    summary: 'Kalispell officials are reviewing a proposed neighborhood development near existing commercial corridors. The cluster would combine city coverage, local reporting, and public-meeting context when available.',
    sourceCount: 3,
    sources: [
      { title: 'Kalispell development proposal heads to review', outlet: 'Flathead Local', url: 'https://example.com/kalispell-dev-1' },
      { title: 'Residents weigh traffic and housing needs', outlet: 'Valley Daily', url: 'https://example.com/kalispell-dev-2' },
      { title: 'Planning board packet outlines next steps', outlet: 'Civic Records', url: 'https://example.com/kalispell-dev-3' }
    ]
  },
  {
    id: 'dc-bike-lane',
    title: 'Protected bike lane work affects several downtown blocks',
    locationName: 'Washington, DC',
    level: 'street',
    coordinates: [-77.0365, 38.8977],
    topic: 'Transportation',
    updatedAt: '1 hour ago',
    summary: 'Transportation crews are adjusting traffic patterns around several downtown blocks as protected bike lane work continues. This is the kind of pinpoint story that could sit over satellite imagery in the final app.',
    sourceCount: 2,
    sources: [
      { title: 'Downtown bike lane construction enters next phase', outlet: 'DC Street Report', url: 'https://example.com/dc-bike-1' },
      { title: 'Traffic advisory issued for downtown blocks', outlet: 'District Notice', url: 'https://example.com/dc-bike-2' }
    ]
  },
  {
    id: 'austin-water',
    title: 'Austin water project moves into neighborhood construction phase',
    locationName: 'Austin, TX',
    level: 'city',
    coordinates: [-97.7431, 30.2672],
    topic: 'Utilities',
    updatedAt: 'Yesterday',
    summary: 'A utility improvement project is shifting into neighborhood-level work, bringing road closures and scheduled service updates. Real MVP logic will replace this mock with on-demand local querying.',
    sourceCount: 4,
    sources: [
      { title: 'Austin utility upgrades reach residential streets', outlet: 'Central Texas Wire', url: 'https://example.com/austin-water-1' },
      { title: 'City publishes construction calendar', outlet: 'Austin Civic Desk', url: 'https://example.com/austin-water-2' }
    ]
  }
];

export function filterStoriesForZoom(zoom) {
  const all = mockStoryClusters;
  if (zoom < 3.6) return all.filter((s) => ['national', 'regional'].includes(s.level));
  if (zoom < 5.2) return all.filter((s) => ['regional', 'state'].includes(s.level));
  if (zoom < 7.2) return all.filter((s) => ['state', 'county', 'city'].includes(s.level));
  if (zoom < 10.5) return all.filter((s) => ['city', 'zip', 'street'].includes(s.level));
  return all.filter((s) => ['street', 'city'].includes(s.level));
}
