import { US_STATE_CITIES } from "@/lib/geo/us-locations";
import { normalizeCountryKey } from "@/lib/geo/cities";

export type SearchLocationMode = "city" | "state";

export type SearchPlan = {
  mode: SearchLocationMode;
  /** User-facing selection (state name or city value). */
  selection: string;
  /** Locations to query against the provider. */
  cities: string[];
  perCityTarget: number;
};

const STATE_BY_NAME = new Map(
  US_STATE_CITIES.map((row) => [row.state.toLowerCase(), row]),
);

export function isUsStateSelection(value: string): boolean {
  return STATE_BY_NAME.has(value.trim().toLowerCase());
}

/** City query strings for a US state, e.g. `"Los Angeles, CA"`. */
export function citiesForState(state: string): string[] {
  const row = STATE_BY_NAME.get(state.trim().toLowerCase());
  if (!row) return [];
  return row.cities.map((city) =>
    row.abbrev === "DC" ? "Washington, DC" : `${city}, ${row.abbrev}`,
  );
}

/**
 * City → target 300. US state (“All of X”) → each listed city at 150.
 * Non-US always city mode at 300.
 */
export function resolveSearchPlan(
  locationValue: string,
  country: string,
): SearchPlan {
  const selection = locationValue.trim();
  const countryKey = normalizeCountryKey(country);

  if (countryKey === "United States" && isUsStateSelection(selection)) {
    const cities = citiesForState(selection);
    return {
      mode: "state",
      selection,
      cities: cities.length > 0 ? cities : [selection],
      perCityTarget: 150,
    };
  }

  return {
    mode: "city",
    selection,
    cities: [selection],
    perCityTarget: 300,
  };
}
