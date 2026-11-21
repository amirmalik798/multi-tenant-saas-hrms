import type { SalarySlipPayload } from "@/features/payroll/salary-slip-document";

export function normalizeCurrencyCode(value: string | null | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

export function paymentUsesOrganizationCurrency(
  paymentCurrencyCode: string | null | undefined,
  organizationCurrencyCode: string | null | undefined,
  backendMismatch = false,
): boolean {
  const expected = normalizeCurrencyCode(organizationCurrencyCode);
  const actual = normalizeCurrencyCode(paymentCurrencyCode);
  return Boolean(expected && actual && expected === actual && !backendMismatch);
}

export function assertSalarySlipUsesOrganizationCurrency(
  payload: SalarySlipPayload,
  organizationCurrencyCode: string | null | undefined,
): void {
  const expected = normalizeCurrencyCode(organizationCurrencyCode);
  if (!expected) {
    throw new Error("The organization currency could not be verified. A salary slip cannot be generated until the organization currency is configured.");
  }

  const mismatch = payload.months.some((month) =>
    month.currencyMismatch ||
    (month.totalsByCurrency ?? []).some((item) =>
      item.currencyCode ? normalizeCurrencyCode(item.currencyCode) !== expected : item.amount !== null && item.amount !== undefined
    ) ||
    (month.ratePeriods ?? []).some((period) =>
      period.currencyCode ? normalizeCurrencyCode(period.currencyCode) !== expected : period.hourlyRate !== null || period.overtimeRate !== null
    ) ||
    (month.days ?? []).some((day) =>
      day.payableMinutes > 0 && (day.currencyCode ? normalizeCurrencyCode(day.currencyCode) !== expected : true)
    )
  );

  if (mismatch) {
    throw new Error(
      `This salary slip contains pay-rate data that does not use the organization's configured currency (${expected}). The slip was not generated. Ask HR to review the employee's historical pay-rate currency.`
    );
  }
}
