/**
 * Shared geographic data: continent mapping, country list, and helpers.
 */

export const CONTINENT_MAP: Record<string, string> = {
  // Europe
  'France': 'Europe', 'Belgique': 'Europe', 'Belgium': 'Europe', 'Suisse': 'Europe', 'Switzerland': 'Europe',
  'Luxembourg': 'Europe', 'Espagne': 'Europe', 'Spain': 'Europe', 'Italie': 'Europe', 'Italy': 'Europe',
  'Allemagne': 'Europe', 'Germany': 'Europe', 'Portugal': 'Europe', 'Pays-Bas': 'Europe', 'Netherlands': 'Europe',
  'Royaume-Uni': 'Europe', 'United Kingdom': 'Europe', 'Angleterre': 'Europe', 'Croatie': 'Europe', 'Croatia': 'Europe',
  'Monaco': 'Europe', 'Andorre': 'Europe', 'Andorra': 'Europe', 'Grece': 'Europe', 'Greece': 'Europe',
  'Turquie': 'Europe', 'Turkey': 'Europe', 'Autriche': 'Europe', 'Austria': 'Europe',
  'Pologne': 'Europe', 'Poland': 'Europe', 'Republique Tcheque': 'Europe', 'Czech Republic': 'Europe',
  'Hongrie': 'Europe', 'Hungary': 'Europe', 'Roumanie': 'Europe', 'Romania': 'Europe',
  'Suede': 'Europe', 'Sweden': 'Europe', 'Norvege': 'Europe', 'Norway': 'Europe',
  'Danemark': 'Europe', 'Denmark': 'Europe', 'Finlande': 'Europe', 'Finland': 'Europe',
  'Irlande': 'Europe', 'Ireland': 'Europe', 'Ecosse': 'Europe', 'Scotland': 'Europe',
  'Russie': 'Europe', 'Russia': 'Europe', 'Ukraine': 'Europe', 'Serbie': 'Europe', 'Serbia': 'Europe',
  'Bulgarie': 'Europe', 'Bulgaria': 'Europe', 'Slovaquie': 'Europe', 'Slovakia': 'Europe',
  'Slovenie': 'Europe', 'Slovenia': 'Europe', 'Lituanie': 'Europe', 'Lithuania': 'Europe',
  'Lettonie': 'Europe', 'Latvia': 'Europe', 'Estonie': 'Europe', 'Estonia': 'Europe',
  'Bosnie-Herzegovine': 'Europe', 'Bosnia': 'Europe', 'Montenegro': 'Europe',
  'Macedoine du Nord': 'Europe', 'North Macedonia': 'Europe', 'Albanie': 'Europe', 'Albania': 'Europe',
  'Moldavie': 'Europe', 'Moldova': 'Europe', 'Bielorussie': 'Europe', 'Belarus': 'Europe',
  'Georgie': 'Europe', 'Georgia': 'Europe', 'Armenie': 'Europe', 'Armenia': 'Europe',
  'Azerbaidjan': 'Europe', 'Azerbaijan': 'Europe', 'Chypre': 'Europe', 'Cyprus': 'Europe',
  'Malte': 'Europe', 'Malta': 'Europe', 'Islande': 'Europe', 'Iceland': 'Europe',
  // Africa
  'Tunisie': 'Africa', 'Tunisia': 'Africa', 'Maroc': 'Africa', 'Morocco': 'Africa',
  'Algerie': 'Africa', 'Algeria': 'Africa', 'Senegal': 'Africa', 'Madagascar': 'Africa',
  'Cote d\'Ivoire': 'Africa', 'Ivory Coast': 'Africa', 'Cameroun': 'Africa', 'Cameroon': 'Africa',
  'Afrique du Sud': 'Africa', 'South Africa': 'Africa', 'Egypte': 'Africa', 'Egypt': 'Africa',
  'Mali': 'Africa', 'Burkina Faso': 'Africa', 'Niger': 'Africa', 'Togo': 'Africa', 'Benin': 'Africa',
  'Gabon': 'Africa', 'Congo': 'Africa', 'Reunion': 'Africa', 'Mayotte': 'Africa', 'Maurice': 'Africa', 'Mauritius': 'Africa',
  'Nigeria': 'Africa', 'Ghana': 'Africa', 'Kenya': 'Africa', 'Tanzanie': 'Africa', 'Tanzania': 'Africa',
  'Ethiopie': 'Africa', 'Ethiopia': 'Africa', 'Ouganda': 'Africa', 'Uganda': 'Africa',
  'Rwanda': 'Africa', 'Mozambique': 'Africa', 'Zimbabwe': 'Africa',
  'Namibie': 'Africa', 'Namibia': 'Africa', 'Botswana': 'Africa',
  'Guinee': 'Africa', 'Guinea': 'Africa', 'Libye': 'Africa', 'Libya': 'Africa',
  'Soudan': 'Africa', 'Sudan': 'Africa', 'Tchad': 'Africa', 'Chad': 'Africa',
  'Centrafrique': 'Africa', 'RD Congo': 'Africa', 'Comores': 'Africa', 'Comoros': 'Africa',
  'Djibouti': 'Africa', 'Erythree': 'Africa', 'Eritrea': 'Africa',
  // North America
  'Canada': 'North America', 'Etats-Unis': 'North America', 'United States': 'North America', 'USA': 'North America',
  'Mexique': 'North America', 'Mexico': 'North America',
  'Guadeloupe': 'North America', 'Martinique': 'North America', 'Guyane': 'South America',
  // South America
  'Bresil': 'South America', 'Brazil': 'South America', 'Argentine': 'South America', 'Argentina': 'South America',
  'Chili': 'South America', 'Chile': 'South America', 'Colombie': 'South America', 'Colombia': 'South America',
  'Perou': 'South America', 'Peru': 'South America', 'Venezuela': 'South America',
  'Equateur': 'South America', 'Ecuador': 'South America', 'Bolivie': 'South America', 'Bolivia': 'South America',
  'Paraguay': 'South America', 'Uruguay': 'South America',
  'Suriname': 'South America', 'Guyana': 'South America',
  // Asia
  'Thailande': 'Asia', 'Thailand': 'Asia', 'Japon': 'Asia', 'Japan': 'Asia', 'Chine': 'Asia', 'China': 'Asia',
  'Vietnam': 'Asia', 'Cambodge': 'Asia', 'Cambodia': 'Asia', 'Laos': 'Asia',
  'Inde': 'Asia', 'India': 'Asia', 'Coree du Sud': 'Asia', 'South Korea': 'Asia',
  'Liban': 'Asia', 'Lebanon': 'Asia', 'Israel': 'Asia',
  'Indonesie': 'Asia', 'Indonesia': 'Asia', 'Philippines': 'Asia', 'Malaisie': 'Asia', 'Malaysia': 'Asia',
  'Singapour': 'Asia', 'Singapore': 'Asia', 'Pakistan': 'Asia', 'Bangladesh': 'Asia',
  'Sri Lanka': 'Asia', 'Nepal': 'Asia', 'Myanmar': 'Asia', 'Mongolie': 'Asia', 'Mongolia': 'Asia',
  'Emirats Arabes Unis': 'Asia', 'UAE': 'Asia', 'United Arab Emirates': 'Asia',
  'Arabie Saoudite': 'Asia', 'Saudi Arabia': 'Asia', 'Qatar': 'Asia', 'Koweit': 'Asia', 'Kuwait': 'Asia',
  'Jordanie': 'Asia', 'Jordan': 'Asia', 'Irak': 'Asia', 'Iraq': 'Asia', 'Iran': 'Asia',
  'Oman': 'Asia', 'Bahrein': 'Asia', 'Bahrain': 'Asia', 'Yemen': 'Asia', 'Syrie': 'Asia', 'Syria': 'Asia',
  'Afghanistan': 'Asia', 'Ouzbekistan': 'Asia', 'Uzbekistan': 'Asia', 'Kazakhstan': 'Asia',
  'Taiwan': 'Asia', 'Hong Kong': 'Asia',
  // Oceania
  'Australie': 'Oceania', 'Australia': 'Oceania', 'Nouvelle-Zelande': 'Oceania', 'New Zealand': 'Oceania',
  'Nouvelle-Caledonie': 'Oceania', 'Polynesie': 'Oceania', 'Tahiti': 'Oceania',
  'Wallis-et-Futuna': 'Oceania',
};

const normalizeCountry = (str: string) =>
  str
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();

export function getContinent(country: string): string {
  return CONTINENT_MAP[normalizeCountry(country)] || 'Europe';
}

/** Localized continent labels */
export function getContinentLabel(continent: string, fr: boolean): string {
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

/** Country name to flag emoji mapping */
const COUNTRY_FLAGS: Record<string, string> = {
  'France': '🇫🇷', 'Belgique': '🇧🇪', 'Belgium': '🇧🇪', 'Suisse': '🇨🇭', 'Switzerland': '🇨🇭',
  'Monaco': '🇲🇨', 'Luxembourg': '🇱🇺',
  'Espagne': '🇪🇸', 'Spain': '🇪🇸', 'Italie': '🇮🇹', 'Italy': '🇮🇹',
  'Portugal': '🇵🇹', 'Allemagne': '🇩🇪', 'Germany': '🇩🇪',
  'Pays-Bas': '🇳🇱', 'Netherlands': '🇳🇱', 'Royaume-Uni': '🇬🇧', 'United Kingdom': '🇬🇧',
  'Angleterre': '🏴\u200d', 'Croatie': '🇭🇷', 'Croatia': '🇭🇷',
  'Andorre': '🇦🇩', 'Andorra': '🇦🇩', 'Grece': '🇬🇷', 'Greece': '🇬🇷',
  'Turquie': '🇹🇷', 'Turkey': '🇹🇷', 'Autriche': '🇦🇹', 'Austria': '🇦🇹',
  'Pologne': '🇵🇱', 'Poland': '🇵🇱', 'Republique Tcheque': '🇨🇿', 'Czech Republic': '🇨🇿',
  'Hongrie': '🇭🇺', 'Hungary': '🇭🇺', 'Roumanie': '🇷🇴', 'Romania': '🇷🇴',
  'Suede': '🇸🇪', 'Sweden': '🇸🇪', 'Norvege': '🇳🇴', 'Norway': '🇳🇴',
  'Danemark': '🇩🇰', 'Denmark': '🇩🇰', 'Finlande': '🇫🇮', 'Finland': '🇫🇮',
  'Irlande': '🇮🇪', 'Ireland': '🇮🇪', 'Ecosse': '🏴\u200d',
  'Russie': '🇷🇺', 'Russia': '🇷🇺', 'Ukraine': '🇺🇦', 'Serbie': '🇷🇸', 'Serbia': '🇷🇸',
  'Bulgarie': '🇧🇬', 'Bulgaria': '🇧🇬', 'Slovaquie': '🇸🇰', 'Slovakia': '🇸🇰',
  'Slovenie': '🇸🇮', 'Slovenia': '🇸🇮', 'Lituanie': '🇱🇹', 'Lithuania': '🇱🇹',
  'Lettonie': '🇱🇻', 'Latvia': '🇱🇻', 'Estonie': '🇪🇪', 'Estonia': '🇪🇪',
  'Bosnie-Herzegovine': '🇧🇦', 'Bosnia': '🇧🇦', 'Montenegro': '🇲🇪',
  'Macedoine du Nord': '🇲🇰', 'North Macedonia': '🇲🇰', 'Albanie': '🇦🇱', 'Albania': '🇦🇱',
  'Moldavie': '🇲🇩', 'Moldova': '🇲🇩', 'Bielorussie': '🇧🇾', 'Belarus': '🇧🇾',
  'Georgie': '🇬🇪', 'Georgia': '🇬🇪', 'Armenie': '🇦🇲', 'Armenia': '🇦🇲',
  'Azerbaidjan': '🇦🇿', 'Azerbaijan': '🇦🇿', 'Chypre': '🇨🇾', 'Cyprus': '🇨🇾',
  'Malte': '🇲🇹', 'Malta': '🇲🇹', 'Islande': '🇮🇸', 'Iceland': '🇮🇸',
  'Tunisie': '🇹🇳', 'Tunisia': '🇹🇳', 'Maroc': '🇲🇦', 'Morocco': '🇲🇦',
  'Algerie': '🇩🇿', 'Algeria': '🇩🇿', 'Senegal': '🇸🇳', 'Madagascar': '🇲🇬',
  'Cameroun': '🇨🇲', 'Cameroon': '🇨🇲', 'Cote d\'Ivoire': '🇨🇮', 'Ivory Coast': '🇨🇮',
  'Afrique du Sud': '🇿🇦', 'South Africa': '🇿🇦', 'Egypte': '🇪🇬', 'Egypt': '🇪🇬',
  'Mali': '🇲🇱', 'Burkina Faso': '🇧🇫', 'Niger': '🇳🇪', 'Togo': '🇹🇬', 'Benin': '🇧🇯',
  'Gabon': '🇬🇦', 'Congo': '🇨🇬', 'Reunion': '🇷🇪', 'Mayotte': '🇾🇹',
  'Maurice': '🇲🇺', 'Mauritius': '🇲🇺',
  'Nigeria': '🇳🇬', 'Ghana': '🇬🇭', 'Kenya': '🇰🇪', 'Tanzanie': '🇹🇿', 'Tanzania': '🇹🇿',
  'Ethiopie': '🇪🇹', 'Ethiopia': '🇪🇹', 'Ouganda': '🇺🇬', 'Uganda': '🇺🇬',
  'Rwanda': '🇷🇼', 'Mozambique': '🇲🇿', 'Zimbabwe': '🇿🇼',
  'Namibie': '🇳🇦', 'Namibia': '🇳🇦', 'Botswana': '🇧🇼',
  'Guinee': '🇬🇳', 'Guinea': '🇬🇳', 'Libye': '🇱🇾', 'Libya': '🇱🇾',
  'Soudan': '🇸🇩', 'Sudan': '🇸🇩', 'Tchad': '🇹🇩', 'Chad': '🇹🇩',
  'Centrafrique': '🇨🇫', 'RD Congo': '🇨🇩', 'Comores': '🇰🇲', 'Comoros': '🇰🇲',
  'Djibouti': '🇩🇯', 'Erythree': '🇪🇷', 'Eritrea': '🇪🇷',
  'Canada': '🇨🇦', 'Etats-Unis': '🇺🇸', 'United States': '🇺🇸', 'USA': '🇺🇸',
  'Mexique': '🇲🇽', 'Mexico': '🇲🇽',
  'Guadeloupe': '🇬🇵', 'Martinique': '🇲🇶', 'Guyane': '🇬🇫',
  'Bresil': '🇧🇷', 'Brazil': '🇧🇷', 'Argentine': '🇦🇷', 'Argentina': '🇦🇷',
  'Chili': '🇨🇱', 'Chile': '🇨🇱', 'Colombie': '🇨🇴', 'Colombia': '🇨🇴',
  'Perou': '🇵🇪', 'Peru': '🇵🇪', 'Venezuela': '🇻🇪',
  'Equateur': '🇪🇨', 'Ecuador': '🇪🇨', 'Bolivie': '🇧🇴', 'Bolivia': '🇧🇴',
  'Paraguay': '🇵🇾', 'Uruguay': '🇺🇾',
  'Suriname': '🇸🇷', 'Guyana': '🇬🇾',
  'Thailande': '🇹🇭', 'Thailand': '🇹🇭', 'Japon': '🇯🇵', 'Japan': '🇯🇵',
  'Chine': '🇨🇳', 'China': '🇨🇳', 'Vietnam': '🇻🇳',
  'Cambodge': '🇰🇭', 'Cambodia': '🇰🇭', 'Laos': '🇱🇦',
  'Inde': '🇮🇳', 'India': '🇮🇳', 'Coree du Sud': '🇰🇷', 'South Korea': '🇰🇷',
  'Liban': '🇱🇧', 'Lebanon': '🇱🇧', 'Israel': '🇮🇱',
  'Indonesie': '🇮🇩', 'Indonesia': '🇮🇩', 'Philippines': '🇵🇭', 'Malaisie': '🇲🇾', 'Malaysia': '🇲🇾',
  'Singapour': '🇸🇬', 'Singapore': '🇸🇬', 'Pakistan': '🇵🇰', 'Bangladesh': '🇧🇩',
  'Sri Lanka': '🇱🇰', 'Nepal': '🇳🇵', 'Myanmar': '🇲🇲', 'Mongolie': '🇲🇳', 'Mongolia': '🇲🇳',
  'Emirats Arabes Unis': '🇦🇪', 'UAE': '🇦🇪', 'United Arab Emirates': '🇦🇪',
  'Arabie Saoudite': '🇸🇦', 'Saudi Arabia': '🇸🇦', 'Qatar': '🇶🇦', 'Koweit': '🇰🇼', 'Kuwait': '🇰🇼',
  'Jordanie': '🇯🇴', 'Jordan': '🇯🇴', 'Irak': '🇮🇶', 'Iraq': '🇮🇶', 'Iran': '🇮🇷',
  'Oman': '🇴🇲', 'Bahrein': '🇧🇭', 'Bahrain': '🇧🇭', 'Yemen': '🇾🇪', 'Syrie': '🇸🇾', 'Syria': '🇸🇾',
  'Afghanistan': '🇦🇫', 'Ouzbekistan': '🇺🇿', 'Uzbekistan': '🇺🇿', 'Kazakhstan': '🇰🇿',
  'Taiwan': '🇹🇼', 'Hong Kong': '🇭🇰',
  'Australie': '🇦🇺', 'Australia': '🇦🇺', 'Nouvelle-Zelande': '🇳🇿', 'New Zealand': '🇳🇿',
  'Nouvelle-Caledonie': '🇳🇨', 'Polynesie': '🇵🇫', 'Tahiti': '🇵🇫',
  'Wallis-et-Futuna': '🇼🇫'
};

/** Get flag emoji for a country name. Returns empty string if not found. */
export function getCountryFlag(country: string): string {
  return COUNTRY_FLAGS[normalizeCountry(country)] || '';
}

/** Continent flag/emoji */
export function getContinentFlag(continent: string): string {
  const flags: Record<string, string> = {
    'Europe': '🇪🇺', 'Africa': '🌍', 'Asia': '🌏',
    'North America': '🌎', 'South America': '🌎', 'Oceania': '🌏',
  };
  return flags[continent] || '🌐';
}

/** Common petanque countries for picker (sorted by relevance) */
export const COMMON_COUNTRIES = [
  // Europe
  'France', 'Belgique', 'Suisse', 'Monaco', 'Luxembourg',
  'Espagne', 'Italie', 'Portugal', 'Allemagne',
  'Pays-Bas', 'Royaume-Uni', 'Croatie', 'Grece', 'Turquie',
  'Autriche', 'Pologne', 'Hongrie', 'Roumanie', 'Andorre',
  'Suede', 'Norvege', 'Danemark', 'Finlande', 'Irlande',
  'Russie', 'Ukraine', 'Serbie', 'Bulgarie', 'Slovaquie', 'Slovenie',
  'Lituanie', 'Lettonie', 'Estonie', 'Bosnie-Herzegovine', 'Montenegro',
  'Macedoine du Nord', 'Albanie', 'Moldavie', 'Bielorussie', 'Georgie',
  'Armenie', 'Azerbaidjan', 'Chypre', 'Malte', 'Islande',
  // Africa
  'Tunisie', 'Maroc', 'Algerie', 'Senegal', 'Madagascar',
  'Cameroun', 'Cote d\'Ivoire', 'Mali', 'Gabon', 'Togo', 'Benin',
  'Nigeria', 'Ghana', 'Kenya', 'Tanzanie', 'Ethiopie', 'Ouganda', 'Rwanda',
  'Afrique du Sud', 'Namibie', 'Botswana', 'Zimbabwe', 'Mozambique',
  'Guinee', 'Burkina Faso', 'Niger', 'Libye', 'Egypte', 'Soudan', 'Tchad',
  'Centrafrique', 'Congo', 'RD Congo', 'Comores', 'Djibouti', 'Erythree',
  'Reunion', 'Mayotte', 'Maurice',
  // Americas
  'Canada', 'Etats-Unis', 'Mexique',
  'Guadeloupe', 'Martinique', 'Guyane',
  'Bresil', 'Argentine', 'Chili', 'Colombie', 'Perou', 'Venezuela',
  'Equateur', 'Bolivie', 'Paraguay', 'Uruguay',
  // Asia
  'Thailande', 'Japon', 'Cambodge', 'Vietnam', 'Laos', 'Chine',
  'Indonesie', 'Philippines', 'Malaisie', 'Singapour',
  'Inde', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal',
  'Coree du Sud', 'Taiwan', 'Hong Kong', 'Mongolie',
  'Liban', 'Israel', 'Emirats Arabes Unis', 'Arabie Saoudite', 'Qatar',
  'Jordanie', 'Iran', 'Irak', 'Koweit', 'Oman',
  'Kazakhstan', 'Ouzbekistan',
  // Oceania
  'Australie', 'Nouvelle-Zelande', 'Nouvelle-Caledonie', 'Polynesie', 'Tahiti',
];
