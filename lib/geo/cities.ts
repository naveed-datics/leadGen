import { US_STATE_CITIES } from "@/lib/geo/us-locations";

export type LocationChoice = {
  value: string;
  label: string;
  group: string;
};

const COUNTRY_CITY_LISTS: Record<string, string[]> = {
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

function usLocationChoices(): LocationChoice[] {
  const choices: LocationChoice[] = [];
  for (const { state, abbrev, cities } of US_STATE_CITIES) {
    choices.push({
      value: state,
      label: `All of ${state}`,
      group: `${state} (${abbrev})`,
    });
    for (const city of cities) {
      const value = abbrev === "DC" ? "Washington, DC" : `${city}, ${abbrev}`;
      choices.push({
        value,
        label: value,
        group: `${state} (${abbrev})`,
      });
    }
  }
  return choices;
}

const US_CHOICES = usLocationChoices();

function flatChoices(country: string, cities: string[]): LocationChoice[] {
  return cities.map((city) => ({
    value: city,
    label: city,
    group: country,
  }));
}

export function listCountries(): string[] {
  return ["Pakistan", "UAE", "United Kingdom", "United States"].sort();
}

export function normalizeCountryKey(country: string): string | null {
  const trimmed = country.trim();
  if (!trimmed) return null;

  const known = ["Pakistan", "UAE", "United Kingdom", "United States"];
  if (known.includes(trimmed)) return trimmed;

  const normalized = trimmed.toLowerCase();
  return known.find((k) => k.trim().toLowerCase() === normalized) ?? null;
}

export function listLocationChoices(country: string): LocationChoice[] {
  const key = normalizeCountryKey(country);
  if (!key) return [];
  if (key === "United States") return US_CHOICES;
  const cities = COUNTRY_CITY_LISTS[key] ?? [];
  return flatChoices(key, cities);
}

/** All selectable location values (state-wide or city) for a country. */
export function listCitiesForCountry(country: string): string[] {
  return listLocationChoices(country).map((choice) => choice.value);
}
