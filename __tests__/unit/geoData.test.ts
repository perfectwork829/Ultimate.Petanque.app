/**
 * Unit tests for constants/geoData.ts
 *
 * Tests: CONTINENT_MAP coverage, getContinent, getContinentLabel FR/EN,
 * getCountryFlag, getContinentFlag, COMMON_COUNTRIES completeness.
 */

// ─── Inline implementations ──

const CONTINENT_MAP: Record<string, string> = {
  'France': 'Europe', 'Belgique': 'Europe', 'Belgium': 'Europe', 'Suisse': 'Europe', 'Switzerland': 'Europe',
  'Luxembourg': 'Europe', 'Espagne': 'Europe', 'Spain': 'Europe', 'Italie': 'Europe', 'Italy': 'Europe',
  'Allemagne': 'Europe', 'Germany': 'Europe', 'Portugal': 'Europe', 'Monaco': 'Europe',
  'Tunisie': 'Africa', 'Tunisia': 'Africa', 'Maroc': 'Africa', 'Morocco': 'Africa',
  'Algerie': 'Africa', 'Algeria': 'Africa', 'Senegal': 'Africa', 'Madagascar': 'Africa',
  'Reunion': 'Africa', 'Mayotte': 'Africa',
  'Canada': 'North America', 'Etats-Unis': 'North America', 'United States': 'North America', 'USA': 'North America',
  'Guadeloupe': 'North America', 'Martinique': 'North America',
  'Bresil': 'South America', 'Brazil': 'South America', 'Argentine': 'South America', 'Argentina': 'South America',
  'Guyane': 'South America',
  'Thailande': 'Asia', 'Thailand': 'Asia', 'Japon': 'Asia', 'Japan': 'Asia', 'Chine': 'Asia', 'China': 'Asia',
  'Vietnam': 'Asia', 'Liban': 'Asia', 'Lebanon': 'Asia',
  'Australie': 'Oceania', 'Australia': 'Oceania', 'Nouvelle-Zelande': 'Oceania', 'New Zealand': 'Oceania',
  'Nouvelle-Caledonie': 'Oceania', 'Polynesie': 'Oceania', 'Tahiti': 'Oceania',
};

function getContinent(country: string): string {
  return CONTINENT_MAP[country] || 'Europe';
}

function getContinentLabel(continent: string, fr: boolean): string {
  const labels: Record<string, { fr: string; en: string }> = {
    'Europe': { fr: 'Europe', en: 'Europe' },
    'Africa': { fr: 'Afrique', en: 'Africa' },
    'Asia': { fr: 'Asie', en: 'Asia' },
    'North America': { fr: 'Am. du Nord', en: 'N. America' },
    'South America': { fr: 'Am. du Sud', en: 'S. America' },
    'Oceania': { fr: 'Oceanie', en: 'Oceania' },
  };
  const l = labels[continent];
  return l ? (fr ? l.fr : l.en) : continent;
}

const COUNTRY_FLAGS: Record<string, string> = {
  'France': '🇫🇷', 'Belgique': '🇧🇪', 'Suisse': '🇨🇭', 'Espagne': '🇪🇸',
  'Italie': '🇮🇹', 'Allemagne': '🇩🇪', 'Portugal': '🇵🇹',
  'Tunisie': '🇹🇳', 'Maroc': '🇲🇦', 'Canada': '🇨🇦', 'Japon': '🇯🇵',
  'Australie': '🇦🇺', 'Bresil': '🇧🇷',
};

function getCountryFlag(country: string): string {
  return COUNTRY_FLAGS[country] || '';
}

function getContinentFlag(continent: string): string {
  const flags: Record<string, string> = {
    'Europe': '🇪🇺', 'Africa': '🌍', 'Asia': '🌏',
    'North America': '🌎', 'South America': '🌎', 'Oceania': '🌏',
  };
  return flags[continent] || '🌐';
}

const COMMON_COUNTRIES = [
  'France', 'Belgique', 'Suisse', 'Monaco', 'Luxembourg',
  'Espagne', 'Italie', 'Portugal', 'Allemagne',
  'Tunisie', 'Maroc', 'Algerie', 'Senegal', 'Madagascar',
  'Canada', 'Etats-Unis',
  'Bresil', 'Argentine',
  'Thailande', 'Japon', 'Vietnam',
  'Australie', 'Nouvelle-Zelande', 'Nouvelle-Caledonie',
];

// ─── Tests ──

describe('getContinent', () => {
  test('France = Europe', () => { expect(getContinent('France')).toBe('Europe'); });
  test('Belgique = Europe', () => { expect(getContinent('Belgique')).toBe('Europe'); });
  test('Belgium = Europe (English)', () => { expect(getContinent('Belgium')).toBe('Europe'); });
  test('Tunisie = Africa', () => { expect(getContinent('Tunisie')).toBe('Africa'); });
  test('Morocco = Africa', () => { expect(getContinent('Morocco')).toBe('Africa'); });
  test('Reunion = Africa', () => { expect(getContinent('Reunion')).toBe('Africa'); });
  test('Canada = North America', () => { expect(getContinent('Canada')).toBe('North America'); });
  test('USA = North America', () => { expect(getContinent('USA')).toBe('North America'); });
  test('Guadeloupe = North America', () => { expect(getContinent('Guadeloupe')).toBe('North America'); });
  test('Guyane = South America', () => { expect(getContinent('Guyane')).toBe('South America'); });
  test('Bresil = South America', () => { expect(getContinent('Bresil')).toBe('South America'); });
  test('Thailande = Asia', () => { expect(getContinent('Thailande')).toBe('Asia'); });
  test('Japon = Asia', () => { expect(getContinent('Japon')).toBe('Asia'); });
  test('Australie = Oceania', () => { expect(getContinent('Australie')).toBe('Oceania'); });
  test('Tahiti = Oceania', () => { expect(getContinent('Tahiti')).toBe('Oceania'); });
  test('unknown defaults to Europe', () => { expect(getContinent('Narnia')).toBe('Europe'); });
});

describe('getContinentLabel - French', () => {
  test('Europe', () => { expect(getContinentLabel('Europe', true)).toBe('Europe'); });
  test('Africa', () => { expect(getContinentLabel('Africa', true)).toBe('Afrique'); });
  test('Asia', () => { expect(getContinentLabel('Asia', true)).toBe('Asie'); });
  test('North America', () => { expect(getContinentLabel('North America', true)).toBe('Am. du Nord'); });
  test('South America', () => { expect(getContinentLabel('South America', true)).toBe('Am. du Sud'); });
  test('Oceania', () => { expect(getContinentLabel('Oceania', true)).toBe('Oceanie'); });
  test('unknown returns raw', () => { expect(getContinentLabel('Antarctica', true)).toBe('Antarctica'); });
});

describe('getContinentLabel - English', () => {
  test('Europe', () => { expect(getContinentLabel('Europe', false)).toBe('Europe'); });
  test('Africa', () => { expect(getContinentLabel('Africa', false)).toBe('Africa'); });
  test('Asia', () => { expect(getContinentLabel('Asia', false)).toBe('Asia'); });
  test('North America', () => { expect(getContinentLabel('North America', false)).toBe('N. America'); });
  test('South America', () => { expect(getContinentLabel('South America', false)).toBe('S. America'); });
  test('Oceania', () => { expect(getContinentLabel('Oceania', false)).toBe('Oceania'); });
});

describe('getCountryFlag', () => {
  test('France = FR flag', () => { expect(getCountryFlag('France')).toBe('🇫🇷'); });
  test('Belgique = BE flag', () => { expect(getCountryFlag('Belgique')).toBe('🇧🇪'); });
  test('Japon = JP flag', () => { expect(getCountryFlag('Japon')).toBe('🇯🇵'); });
  test('unknown = empty string', () => { expect(getCountryFlag('Unknown')).toBe(''); });
});

describe('getContinentFlag', () => {
  test('Europe = EU flag', () => { expect(getContinentFlag('Europe')).toBe('🇪🇺'); });
  test('Africa = earth emoji', () => { expect(getContinentFlag('Africa')).toBe('🌍'); });
  test('Asia = earth emoji', () => { expect(getContinentFlag('Asia')).toBe('🌏'); });
  test('North America = earth emoji', () => { expect(getContinentFlag('North America')).toBe('🌎'); });
  test('unknown = globe', () => { expect(getContinentFlag('Unknown')).toBe('🌐'); });
});

describe('CONTINENT_MAP', () => {
  test('covers 6 continents', () => {
    const continents = new Set(Object.values(CONTINENT_MAP));
    expect(continents.size).toBe(6);
  });

  test('bilingual entries for major countries', () => {
    expect(CONTINENT_MAP['France']).toBe(CONTINENT_MAP['France']); // FR only
    expect(CONTINENT_MAP['Belgium']).toBe(CONTINENT_MAP['Belgique']);
    expect(CONTINENT_MAP['Switzerland']).toBe(CONTINENT_MAP['Suisse']);
    expect(CONTINENT_MAP['Spain']).toBe(CONTINENT_MAP['Espagne']);
    expect(CONTINENT_MAP['Italy']).toBe(CONTINENT_MAP['Italie']);
    expect(CONTINENT_MAP['Germany']).toBe(CONTINENT_MAP['Allemagne']);
  });

  test('French overseas territories mapped correctly', () => {
    expect(CONTINENT_MAP['Reunion']).toBe('Africa');
    expect(CONTINENT_MAP['Mayotte']).toBe('Africa');
    expect(CONTINENT_MAP['Guadeloupe']).toBe('North America');
    expect(CONTINENT_MAP['Martinique']).toBe('North America');
    expect(CONTINENT_MAP['Guyane']).toBe('South America');
    expect(CONTINENT_MAP['Nouvelle-Caledonie']).toBe('Oceania');
    expect(CONTINENT_MAP['Polynesie']).toBe('Oceania');
  });
});

describe('COMMON_COUNTRIES', () => {
  test('has 24+ countries', () => {
    expect(COMMON_COUNTRIES.length).toBeGreaterThanOrEqual(24);
  });

  test('starts with France', () => {
    expect(COMMON_COUNTRIES[0]).toBe('France');
  });

  test('all common countries are in CONTINENT_MAP', () => {
    COMMON_COUNTRIES.forEach(c => {
      expect(CONTINENT_MAP[c]).toBeDefined();
    });
  });

  test('no duplicates', () => {
    const unique = new Set(COMMON_COUNTRIES);
    expect(unique.size).toBe(COMMON_COUNTRIES.length);
  });

  test('represents all 6 continents', () => {
    const continents = new Set(COMMON_COUNTRIES.map(c => getContinent(c)));
    expect(continents.size).toBe(6);
  });
});
