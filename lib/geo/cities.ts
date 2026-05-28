export const COUNTRY_CITIES: Record<string, string[]> = {
  Pakistan: [
    "Karachi",
    "Lahore",
    "Islamabad",
    "Rawalpindi",
    "Faisalabad",
    "Multan",
    "Peshawar",
    "Quetta",
    "Sialkot",
    "Gujranwala",
  ],
  UAE: [
    "Dubai",
    "Abu Dhabi",
    "Sharjah",
    "Ajman",
    "Ras Al Khaimah",
    "Fujairah",
    "Umm Al Quwain",
    "Al Ain",
  ],
  "United States": [
    "New York, NY",
    "Los Angeles, CA",
    "Chicago, IL",
    "Houston, TX",
    "Phoenix, AZ",
    "Austin, TX",
    "Dallas, TX",
    "San Francisco, CA",
    "Seattle, WA",
    "Miami, FL",
  ],
  "United Kingdom": [
    "London",
    "Manchester",
    "Birmingham",
    "Leeds",
    "Glasgow",
    "Liverpool",
    "Bristol",
  ],
};

export function listCountries(): string[] {
  return Object.keys(COUNTRY_CITIES).sort();
}

export function normalizeCountryKey(country: string): string | null {
  const trimmed = country.trim();
  if (!trimmed) return null;

  if (COUNTRY_CITIES[trimmed]) return trimmed;

  const normalized = trimmed.toLowerCase();
  const key = Object.keys(COUNTRY_CITIES).find(
    (k) => k.trim().toLowerCase() === normalized,
  );
  return key ?? null;
}

export function listCitiesForCountry(country: string): string[] {
  const key = normalizeCountryKey(country);
  return key ? COUNTRY_CITIES[key] : [];
}

