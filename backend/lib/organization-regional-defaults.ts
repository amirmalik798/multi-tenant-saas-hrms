export type OrganizationRegionalDefaults = {
  countryCode: string;
  timeZone: string;
  locale: string;
  currencyCode: string;
  dateFormat: "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY" | "DD.MM.YYYY";
  weekStartsOn: number;
};

// Country is the country name recorded by the Super Admin. Defaults are
// deliberately explicit and deterministic; administrators can review/edit them.
const REGIONAL_DEFAULTS: Record<string, OrganizationRegionalDefaults> = {
  RW: { countryCode: "RW", timeZone: "Africa/Kigali", locale: "en-RW", currencyCode: "RWF", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  Rwanda: { countryCode: "RW", timeZone: "Africa/Kigali", locale: "en-RW", currencyCode: "RWF", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  KE: { countryCode: "KE", timeZone: "Africa/Nairobi", locale: "en-KE", currencyCode: "KES", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  Kenya: { countryCode: "KE", timeZone: "Africa/Nairobi", locale: "en-KE", currencyCode: "KES", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  UG: { countryCode: "UG", timeZone: "Africa/Kampala", locale: "en-UG", currencyCode: "UGX", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  Uganda: { countryCode: "UG", timeZone: "Africa/Kampala", locale: "en-UG", currencyCode: "UGX", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  TZ: { countryCode: "TZ", timeZone: "Africa/Dar_es_Salaam", locale: "sw-TZ", currencyCode: "TZS", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  Tanzania: { countryCode: "TZ", timeZone: "Africa/Dar_es_Salaam", locale: "sw-TZ", currencyCode: "TZS", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  "United States": { countryCode: "US", timeZone: "America/New_York", locale: "en-US", currencyCode: "USD", dateFormat: "MM/DD/YYYY", weekStartsOn: 7 },
  US: { countryCode: "US", timeZone: "America/New_York", locale: "en-US", currencyCode: "USD", dateFormat: "MM/DD/YYYY", weekStartsOn: 7 },
  "United Kingdom": { countryCode: "GB", timeZone: "Europe/London", locale: "en-GB", currencyCode: "GBP", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  UK: { countryCode: "GB", timeZone: "Europe/London", locale: "en-GB", currencyCode: "GBP", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  GB: { countryCode: "GB", timeZone: "Europe/London", locale: "en-GB", currencyCode: "GBP", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  CA: { countryCode: "CA", timeZone: "America/Toronto", locale: "en-CA", currencyCode: "CAD", dateFormat: "YYYY-MM-DD", weekStartsOn: 1 },
  Canada: { countryCode: "CA", timeZone: "America/Toronto", locale: "en-CA", currencyCode: "CAD", dateFormat: "YYYY-MM-DD", weekStartsOn: 1 },
  AU: { countryCode: "AU", timeZone: "Australia/Sydney", locale: "en-AU", currencyCode: "AUD", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  Australia: { countryCode: "AU", timeZone: "Australia/Sydney", locale: "en-AU", currencyCode: "AUD", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  NZ: { countryCode: "NZ", timeZone: "Pacific/Auckland", locale: "en-NZ", currencyCode: "NZD", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  "New Zealand": { countryCode: "NZ", timeZone: "Pacific/Auckland", locale: "en-NZ", currencyCode: "NZD", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  PK: { countryCode: "PK", timeZone: "Asia/Karachi", locale: "en-PK", currencyCode: "PKR", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  Pakistan: { countryCode: "PK", timeZone: "Asia/Karachi", locale: "en-PK", currencyCode: "PKR", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  IN: { countryCode: "IN", timeZone: "Asia/Kolkata", locale: "en-IN", currencyCode: "INR", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  India: { countryCode: "IN", timeZone: "Asia/Kolkata", locale: "en-IN", currencyCode: "INR", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  ZA: { countryCode: "ZA", timeZone: "Africa/Johannesburg", locale: "en-ZA", currencyCode: "ZAR", dateFormat: "YYYY-MM-DD", weekStartsOn: 1 },
  "South Africa": { countryCode: "ZA", timeZone: "Africa/Johannesburg", locale: "en-ZA", currencyCode: "ZAR", dateFormat: "YYYY-MM-DD", weekStartsOn: 1 },
  NG: { countryCode: "NG", timeZone: "Africa/Lagos", locale: "en-NG", currencyCode: "NGN", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  Nigeria: { countryCode: "NG", timeZone: "Africa/Lagos", locale: "en-NG", currencyCode: "NGN", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  GH: { countryCode: "GH", timeZone: "Africa/Accra", locale: "en-GH", currencyCode: "GHS", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  Ghana: { countryCode: "GH", timeZone: "Africa/Accra", locale: "en-GH", currencyCode: "GHS", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  FR: { countryCode: "FR", timeZone: "Europe/Paris", locale: "fr-FR", currencyCode: "EUR", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  France: { countryCode: "FR", timeZone: "Europe/Paris", locale: "fr-FR", currencyCode: "EUR", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  DE: { countryCode: "DE", timeZone: "Europe/Berlin", locale: "de-DE", currencyCode: "EUR", dateFormat: "DD.MM.YYYY", weekStartsOn: 1 },
  Germany: { countryCode: "DE", timeZone: "Europe/Berlin", locale: "de-DE", currencyCode: "EUR", dateFormat: "DD.MM.YYYY", weekStartsOn: 1 },
  ES: { countryCode: "ES", timeZone: "Europe/Madrid", locale: "es-ES", currencyCode: "EUR", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  Spain: { countryCode: "ES", timeZone: "Europe/Madrid", locale: "es-ES", currencyCode: "EUR", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  IT: { countryCode: "IT", timeZone: "Europe/Rome", locale: "it-IT", currencyCode: "EUR", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  Italy: { countryCode: "IT", timeZone: "Europe/Rome", locale: "it-IT", currencyCode: "EUR", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  NL: { countryCode: "NL", timeZone: "Europe/Amsterdam", locale: "nl-NL", currencyCode: "EUR", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  Netherlands: { countryCode: "NL", timeZone: "Europe/Amsterdam", locale: "nl-NL", currencyCode: "EUR", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  AE: { countryCode: "AE", timeZone: "Asia/Dubai", locale: "en-AE", currencyCode: "AED", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  "United Arab Emirates": { countryCode: "AE", timeZone: "Asia/Dubai", locale: "en-AE", currencyCode: "AED", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  SA: { countryCode: "SA", timeZone: "Asia/Riyadh", locale: "ar-SA", currencyCode: "SAR", dateFormat: "DD/MM/YYYY", weekStartsOn: 7 },
  "Saudi Arabia": { countryCode: "SA", timeZone: "Asia/Riyadh", locale: "ar-SA", currencyCode: "SAR", dateFormat: "DD/MM/YYYY", weekStartsOn: 7 },
  SG: { countryCode: "SG", timeZone: "Asia/Singapore", locale: "en-SG", currencyCode: "SGD", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  Singapore: { countryCode: "SG", timeZone: "Asia/Singapore", locale: "en-SG", currencyCode: "SGD", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  JP: { countryCode: "JP", timeZone: "Asia/Tokyo", locale: "ja-JP", currencyCode: "JPY", dateFormat: "YYYY-MM-DD", weekStartsOn: 1 },
  Japan: { countryCode: "JP", timeZone: "Asia/Tokyo", locale: "ja-JP", currencyCode: "JPY", dateFormat: "YYYY-MM-DD", weekStartsOn: 1 },
  BR: { countryCode: "BR", timeZone: "America/Sao_Paulo", locale: "pt-BR", currencyCode: "BRL", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  Brazil: { countryCode: "BR", timeZone: "America/Sao_Paulo", locale: "pt-BR", currencyCode: "BRL", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  MX: { countryCode: "MX", timeZone: "America/Mexico_City", locale: "es-MX", currencyCode: "MXN", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
  Mexico: { countryCode: "MX", timeZone: "America/Mexico_City", locale: "es-MX", currencyCode: "MXN", dateFormat: "DD/MM/YYYY", weekStartsOn: 1 },
};

const COUNTRY_ALIASES: Record<string, string> = {
  "rwanda": "RW", "republic of rwanda": "RW",
  "kenya": "KE", "republic of kenya": "KE",
  "uganda": "UG", "republic of uganda": "UG",
  "tanzania": "TZ", "united republic of tanzania": "TZ",
  "united states of america": "US", "usa": "US",
  "united kingdom of great britain and northern ireland": "GB", "britain": "GB",
  "canada": "CA", "australia": "AU", "new zealand": "NZ",
  "pakistan": "PK", "india": "IN", "south africa": "ZA",
  "nigeria": "NG", "ghana": "GH", "france": "FR", "germany": "DE",
  "spain": "ES", "italy": "IT", "netherlands": "NL",
  "united arab emirates": "AE", "uae": "AE", "saudi arabia": "SA",
  "singapore": "SG", "japan": "JP", "brazil": "BR", "mexico": "MX",
};

export function getOrganizationRegionalDefaults(
  countryName: string | null | undefined,
): OrganizationRegionalDefaults | null {
  const country = (countryName ?? "").trim();
  if (!country) return null;

  const normalized = country.toLocaleLowerCase("en").replace(/\s+/g, " ");
  const aliasedCode = COUNTRY_ALIASES[normalized];
  if (aliasedCode) {
    return Object.values(REGIONAL_DEFAULTS).find(
      (item) => item.countryCode === aliasedCode,
    ) ?? null;
  }

  const direct = REGIONAL_DEFAULTS[country];
  if (direct) return direct;

  const code = country.toUpperCase();
  return REGIONAL_DEFAULTS[code] ?? null;
}
