// Country-specific additions are derived from search locations, never citizenship
// or work-authorization rules. This catalog is shared by the worker and the UI.
export const countrySources = [
  { key: 'getonbrd-co', country: 'CO', label: 'Get on Board', url: 'https://www.getonbrd.com.co/' },
  { key: 'elempleo-co', country: 'CO', label: 'ElEmpleo', url: 'https://www.elempleo.com/co/' },
  { key: 'michaelpage-co', country: 'CO', label: 'Michael Page Colombia', url: 'https://www.michaelpage.com.co/jobs' },
] as const;
export type CountrySource = typeof countrySources[number];
export type CountrySourceKey = CountrySource['key'];

export function normalizedLocation(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
const colombianCities: Record<string, string> = {
  bogota: 'Bogotá', 'bogota d c': 'Bogotá', medellin: 'Medellín', cali: 'Cali',
  barranquilla: 'Barranquilla', bucaramanga: 'Bucaramanga', pereira: 'Pereira',
  manizales: 'Manizales', cucuta: 'Cúcuta', 'santa marta': 'Santa Marta',
  'cartagena de indias': 'Cartagena',
};

/** Empty city means Colombia-wide. Ambiguous foreign city/state strings stay out. */
export function colombiaSearchLocations(locations: readonly string[]): string[] {
  const cities = new Set<string>();
  for (const value of locations) {
    const normalized = normalizedLocation(value);
    const parts = value.split(',').map(normalizedLocation);
    const city = colombianCities[normalized] || colombianCities[parts[0]];
    const explicitCountry = /\bcolombia\b/.test(normalized) || normalized === 'co' || Boolean(city && parts.at(-1) === 'co');
    // Bare, unambiguous city names work; "Medellín, Spain" must not activate CO.
    const bareCity = colombianCities[normalized];
    if (explicitCountry || bareCity) cities.add(city || '');
  }
  return cities.has('') ? [''] : [...cities];
}
export function activeCountrySources(profile: { locations?: readonly string[] }): CountrySource[] {
  const countries = colombiaSearchLocations(profile.locations || []).length ? ['CO'] : [];
  return countrySources.filter(source => countries.includes(source.country));
}
