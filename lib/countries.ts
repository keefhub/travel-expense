export interface Country {
  name: string;
  code: string;
  currency: string;
}

export const SUPPORTED_COUNTRIES: readonly Country[] = [
  { name: "Singapore", code: "SG", currency: "SGD" },
  { name: "Malaysia", code: "MY", currency: "MYR" },
  { name: "Thailand", code: "TH", currency: "THB" },
  { name: "Indonesia", code: "ID", currency: "IDR" },
  { name: "Japan", code: "JP", currency: "JPY" },
  { name: "South Korea", code: "KR", currency: "KRW" },
  { name: "China", code: "CN", currency: "CNY" },
  { name: "Hong Kong", code: "HK", currency: "HKD" },
  { name: "Taiwan", code: "TW", currency: "TWD" },
  { name: "Vietnam", code: "VN", currency: "VND" },
  { name: "Philippines", code: "PH", currency: "PHP" },
  { name: "India", code: "IN", currency: "INR" },
  { name: "Australia", code: "AU", currency: "AUD" },
  { name: "New Zealand", code: "NZ", currency: "NZD" },
  { name: "United States", code: "US", currency: "USD" },
  { name: "Canada", code: "CA", currency: "CAD" },
  { name: "Mexico", code: "MX", currency: "MXN" },
  { name: "Brazil", code: "BR", currency: "BRL" },
  { name: "United Kingdom", code: "GB", currency: "GBP" },
  { name: "Ireland", code: "IE", currency: "EUR" },
  { name: "France", code: "FR", currency: "EUR" },
  { name: "Germany", code: "DE", currency: "EUR" },
  { name: "Italy", code: "IT", currency: "EUR" },
  { name: "Spain", code: "ES", currency: "EUR" },
  { name: "Netherlands", code: "NL", currency: "EUR" },
  { name: "Portugal", code: "PT", currency: "EUR" },
  { name: "Greece", code: "GR", currency: "EUR" },
  { name: "Switzerland", code: "CH", currency: "CHF" },
  { name: "Sweden", code: "SE", currency: "SEK" },
  { name: "Norway", code: "NO", currency: "NOK" },
  { name: "Denmark", code: "DK", currency: "DKK" },
  { name: "Turkey", code: "TR", currency: "TRY" },
  { name: "United Arab Emirates", code: "AE", currency: "AED" },
  { name: "Qatar", code: "QA", currency: "QAR" },
  { name: "Saudi Arabia", code: "SA", currency: "SAR" },
  { name: "South Africa", code: "ZA", currency: "ZAR" },
  { name: "Egypt", code: "EG", currency: "EGP" },
  { name: "Maldives", code: "MV", currency: "MVR" },
  { name: "Sri Lanka", code: "LK", currency: "LKR" },
  { name: "Nepal", code: "NP", currency: "NPR" },
  { name: "Cambodia", code: "KH", currency: "KHR" },
  { name: "Laos", code: "LA", currency: "LAK" },
  { name: "Myanmar", code: "MM", currency: "MMK" },
  { name: "Bangladesh", code: "BD", currency: "BDT" },
  { name: "Pakistan", code: "PK", currency: "PKR" },
];

export function getCurrencyForCountry(countryName: string): string | null {
  const match = SUPPORTED_COUNTRIES.find((c) => c.name === countryName);
  return match ? match.currency : null;
}

export function isSupportedCountry(countryName: string): boolean {
  return SUPPORTED_COUNTRIES.some((c) => c.name === countryName);
}

export function searchSupportedCountries(query: string): readonly Country[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return SUPPORTED_COUNTRIES;
  return SUPPORTED_COUNTRIES.filter((c) => c.name.toLowerCase().includes(trimmed));
}

export function getSupportedCurrencies(): string[] {
  return Array.from(new Set(SUPPORTED_COUNTRIES.map((c) => c.currency))).sort();
}
