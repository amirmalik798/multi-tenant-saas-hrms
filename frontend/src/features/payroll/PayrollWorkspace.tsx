"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, ArrowRight, BadgeDollarSign, CalendarDays, CheckCircle2, ChevronUp, CircleDollarSign, FileDown, Wallet } from "lucide-react";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, TextArea, TextInput } from "@/components/ui/Field";
import { Panel, PanelHeading } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ProfilePhoto } from "@/components/ui/ProfilePhoto";
import { PdfPreparationIndicator } from "@/components/ui/PdfPreparationIndicator";
import { apiRequest } from "@/lib/api-client";
import { formatDate, formatMoney, getISODateInTimeZone, humanize } from "@/lib/format";
import { buildSalarySlipDocument, type SalarySlipPayload } from "@/features/payroll/salary-slip-document";
import { useSmartRefresh } from "@/lib/smart-refresh";
import { useAttendanceRefresh } from "@/lib/attendance-events";
import { PersonalEarningsWorkspace } from "@/features/workspace/PersonalEarningsWorkspace";
import { assertSalarySlipUsesOrganizationCurrency, normalizeCurrencyCode, paymentUsesOrganizationCurrency } from "@/lib/payroll-currency";
import { buildDepartmentManagerPayslipDocument, type DepartmentManagerPayslipMonth } from "@/features/payroll/team-member-payslip-document";
import { buildPdfPreparationDocument } from "@/features/payroll/pdf-preparation-document";

interface Payment {
  id?: string; employeeId: string; employeeCode?: string; firstName?: string; lastName?: string;
  departmentName?: string; workforceRole?: string; payMonth: string; amount: string | null;
  currencyCode: string; calculatedAmount: string | null; status: string; workedMinutes: number;
  payableMinutes: number; paidAt?: string | null; paymentReference?: string | null; notes?: string | null;
  paymentRecorded?: boolean; currencyMismatch?: boolean;
}
interface PaymentPayload { status?: string; payments?: Payment[]; message?: string }
interface PayslipEmployee { employeeId: string; employeeCode: string | null; firstName: string; lastName: string; departmentName: string | null; workforceRole: string | null }
interface PayslipRoster { startMonth?: string; endMonth?: string; employees?: PayslipEmployee[]; limitExceeded?: boolean; maxEmployees?: number; message?: string }

function monthOrdinal(value: string) { const [year, month] = value.split("-").map(Number); return year * 12 + month - 1; }
function monthFromOrdinal(value: number) { const year = Math.floor(value / 12); const month = value % 12 + 1; return `${year}-${String(month).padStart(2, "0")}`; }
function validatePayslipRange(startMonth: string, endMonth: string, currentMonth: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth)) throw new Error("Choose valid From month and To month values.");
  const start = monthOrdinal(startMonth); const end = monthOrdinal(endMonth);
  if (start > end) throw new Error("The From month must be before or equal to the To month.");
  const count = end - start + 1;
  if (count > 24) throw new Error("A salary-slip report can cover at most 24 months.");
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(currentMonth) && end > monthOrdinal(currentMonth)) throw new Error("Future payroll months cannot be included. Select a range ending no later than the current organization month.");
  return count;
}

function duration(minutes: number | null | undefined) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return "—";
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export function PayrollWorkspace() {
  const { user, workDate, currencyCode, timeZone } = useWorkspace();
  const organizationCalendarDate = workDate ?? getISODateInTimeZone(timeZone);
  const [month, setMonth] = useState(organizationCalendarDate.slice(0, 7));
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthTouchedByUser, setMonthTouchedByUser] = useState(false);
  const [queryMonthReady, setQueryMonthReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Payment | null>(null);
  const [targetStatus, setTargetStatus] = useState<"PAID" | "UNPAID">("PAID");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const canManage = user.role === "ORGANIZATION_ADMIN" || user.role === "HR_MANAGER";
  const organizationCurrencyCode = normalizeCurrencyCode(currencyCode);
  const currentOrganizationMonth = organizationCalendarDate.slice(0, 7);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStartMonth, setBulkStartMonth] = useState(month);
  const [bulkEndMonth, setBulkEndMonth] = useState(month);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [slipTarget, setSlipTarget] = useState<Payment | null>(null);
  const [slipStartMonth, setSlipStartMonth] = useState(month);
  const [slipEndMonth, setSlipEndMonth] = useState(month);
  const [slipPayload, setSlipPayload] = useState<SalarySlipPayload | null>(null);
  const [slipLoading, setSlipLoading] = useState(false);
  const [slipPrinting, setSlipPrinting] = useState(false);
  const [slipError, setSlipError] = useState("");
  const [teamSlipTarget, setTeamSlipTarget] = useState<Payment | null>(null);
  const [teamSlipStartMonth, setTeamSlipStartMonth] = useState(month);
  const [teamSlipEndMonth, setTeamSlipEndMonth] = useState(month);
  const [teamSlipBusy, setTeamSlipBusy] = useState(false);
  const [teamSlipError, setTeamSlipError] = useState("");
  const loadRequestId = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
    const requestId = ++loadRequestId.current;
    if (!silent) setLoading(true); setError("");
    try {
      const result = await apiRequest<PaymentPayload>(`/payroll/payments?month=${month}`);
      if (requestId === loadRequestId.current) setPayments(Array.isArray(result.payments) ? result.payments : []);
    } catch (caught) {
      if (requestId === loadRequestId.current) setError(caught instanceof Error ? caught.message : "Unable to load salary payment records.");
    } finally {
      if (requestId === loadRequestId.current && !silent) setLoading(false);
    }
  }, [month]);
  useEffect(() => { if (workDate && !monthTouchedByUser) setMonth(workDate.slice(0, 7)); }, [workDate, monthTouchedByUser]);
  useEffect(() => {
    const requestedMonth = new URLSearchParams(window.location.search).get("month") || "";
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)) {
      const [year] = requestedMonth.split("-").map(Number);
      if (year >= 2000 && year <= 2100) {
        setMonth(requestedMonth);
        setMonthTouchedByUser(true);
      }
    }
    setQueryMonthReady(true);
  }, []);
  useEffect(() => { if (queryMonthReady) void load(); }, [load, queryMonthReady]);
  useSmartRefresh(() => load(true), queryMonthReady && !selected && !slipTarget && !teamSlipTarget && !bulkOpen && !saving && !bulkBusy && !slipLoading && !slipPrinting && !teamSlipBusy);
  useAttendanceRefresh(() => { void load(true); });

  const visible = payments.filter((item) => {
    const needle = search.trim().toLowerCase();
    return !needle || [item.firstName, item.lastName, item.employeeCode, item.departmentName, item.workforceRole, item.status, item.paymentReference].some((value) => String(value ?? "").toLowerCase().includes(needle));
  });
  const paidPayments = payments.filter((item) => item.status === "PAID");
  const duePayments = payments.filter((item) => item.status === "UNPAID");
  const hasMonetaryValue = (item: Payment) => item.amount !== null || item.calculatedAmount !== null || item.payableMinutes > 0;
  const paymentCurrencyMismatch = (item: Payment) => hasMonetaryValue(item) && !paymentUsesOrganizationCurrency(item.currencyCode, organizationCurrencyCode, item.currencyMismatch);
  const paidTotal = paidPayments.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  const dueTotal = duePayments.reduce((sum, item) => sum + Number(item.calculatedAmount ?? 0), 0);
  const paidCurrencyMismatch = paidPayments.some(paymentCurrencyMismatch);
  const dueCurrencyMismatch = duePayments.some(paymentCurrencyMismatch);
  const payableCount = payments.filter((item) => item.status === "UNPAID" || item.status === "PAID").length;
  const needsAttentionCount = payments.filter((item) =>
    ["RATE_REQUIRED", "CURRENCY_MISMATCH", "NO_RECORDED_HOURS"].includes(item.status) ||
    paymentCurrencyMismatch(item)
  ).length;
  const currencyMismatchCount = payments.filter(paymentCurrencyMismatch).length;

  function openPayment(item: Payment) {
    if (!paymentUsesOrganizationCurrency(item.currencyCode, organizationCurrencyCode, item.currencyMismatch)) {
      setError("This payment cannot be updated because its pay-rate currency does not match the organization currency. Ask HR to review the employee’s pay-rate history.");
      return;
    }
    setSelected(item);
    setTargetStatus(item.status === "PAID" ? "UNPAID" : "PAID");
    setReference(item.paymentReference ?? "");
    setNotes(item.notes ?? "");
    setError("");
  }

  async function savePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest("/payroll/payments", { method: "PUT", body: JSON.stringify({
        employeeId: selected.employeeId, month, currencyCode: organizationCurrencyCode ?? selected.currencyCode,
        status: targetStatus, paymentReference: reference.trim(), notes: notes.trim(),
      }) });
      setSelected(null);
      setNotice(targetStatus === "PAID" ? "Payment status recorded as paid. No money was transferred by HRMS." : "Paid status reversed. The payment record is now unpaid.");
      await load();
      window.setTimeout(() => setNotice(""), 5000);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to record the salary payment."); }
    finally { setSaving(false); }
  }

  function openIndividualSlip(item: Payment) {
    setSlipTarget(item); setSlipStartMonth(month); setSlipEndMonth(month); setSlipPayload(null); setSlipError("");
  }

  function openTeamMemberPayslip(item: Payment) {
    setTeamSlipTarget(item);
    setTeamSlipStartMonth(month);
    setTeamSlipEndMonth(month);
    setTeamSlipError("");
  }

  async function generateTeamMemberPayslip() {
    if (user.role !== "DEPARTMENT_MANAGER" || !teamSlipTarget || teamSlipBusy) return;
    let monthCount = 0;
    try {
      monthCount = validatePayslipRange(teamSlipStartMonth, teamSlipEndMonth, currentOrganizationMonth);
      if (!organizationCurrencyCode) throw new Error("The organization's configured currency could not be verified.");
    } catch (caught) {
      setTeamSlipError(caught instanceof Error ? caught.message : "Choose a valid month range.");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setTeamSlipError("Your browser blocked the payslip window. Allow pop-ups for this site and try again.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildPdfPreparationDocument("payslip", document.documentElement.dataset.theme === "dark" ? "dark" : "light"));
    printWindow.document.close();

    setTeamSlipBusy(true);
    setTeamSlipError("");
    try {
      const months: DepartmentManagerPayslipMonth[] = [];
      let foundAnyRecord = false;
      for (let index = 0; index < monthCount; index += 1) {
        const selectedMonth = monthFromOrdinal(monthOrdinal(teamSlipStartMonth) + index);
        const result = await apiRequest<PaymentPayload & { month?: string }>(`/payroll/payments?month=${encodeURIComponent(selectedMonth)}`);
        if (result.month !== selectedMonth || !Array.isArray(result.payments)) {
          throw new Error(`The payroll response for ${selectedMonth} was incomplete. No payslip was generated.`);
        }

        const item = result.payments.find((payment) => payment.employeeId === teamSlipTarget.employeeId);
        if (!item) {
          months.push({
            month: selectedMonth,
            hasPayrollRecord: false,
            workedMinutes: 0,
            payableMinutes: 0,
            calculatedAmount: null,
            recordedAmount: null,
            paymentStatus: "NO PAYROLL RECORD",
            paidAt: null,
            reference: null,
          });
          continue;
        }

        foundAnyRecord = true;
        if (paymentCurrencyMismatch(item)) {
          throw new Error(`The ${selectedMonth} salary cannot be stated in ${organizationCurrencyCode}: its pay-rate currency is ${normalizeCurrencyCode(item.currencyCode) || "unavailable"}. HR or the Organization Admin must reconcile the employee's historical pay-rate currency first. No converted amount has been invented.`);
        }
        if (item.payableMinutes > 0 && item.calculatedAmount === null) {
          throw new Error(`The ${selectedMonth} salary is incomplete because payable time has no effective pay rate. Ask HR to complete the rate history before generating this payslip.`);
        }
        const calculatedAmount = item.calculatedAmount === null ? null : Number(item.calculatedAmount);
        const recordedAmount = item.status === "PAID" && item.amount !== null ? Number(item.amount) : null;
        if ((calculatedAmount !== null && !Number.isFinite(calculatedAmount)) || (recordedAmount !== null && !Number.isFinite(recordedAmount))) {
          throw new Error(`The payroll amount for ${selectedMonth} is invalid. No payslip was generated.`);
        }
        months.push({
          month: selectedMonth,
          hasPayrollRecord: true,
          workedMinutes: Math.max(0, Number(item.workedMinutes) || 0),
          payableMinutes: Math.max(0, Number(item.payableMinutes) || 0),
          calculatedAmount,
          recordedAmount,
          paymentStatus: item.status,
          paidAt: item.paidAt ?? null,
          reference: item.paymentReference ?? null,
        });
      }
      if (!foundAnyRecord) throw new Error("No payroll activity was found for this employee in the selected period. Confirm that the employee is still in one of your assigned departments.");
      if (printWindow.closed) throw new Error("The print window was closed before the statement was ready. Generate it again.");

      const documentHtml = buildDepartmentManagerPayslipDocument({
        organizationName: user.organizationName,
        employee: {
          name: [teamSlipTarget.firstName, teamSlipTarget.lastName].filter(Boolean).join(" ") || "Workforce member",
          employeeCode: teamSlipTarget.employeeCode || "Not assigned",
          departmentName: teamSlipTarget.departmentName || "No department",
        },
        currencyCode: organizationCurrencyCode,
        timeZone,
        startMonth: teamSlipStartMonth,
        endMonth: teamSlipEndMonth,
        generatedAt: new Date().toISOString(),
        months,
      });
      printWindow.document.open();
      printWindow.document.write(documentHtml);
      printWindow.document.close();
      window.setTimeout(() => {
        if (!printWindow.closed) {
          printWindow.focus();
          printWindow.print();
        }
      }, 300);
      setTeamSlipTarget(null);
      setNotice(`Salary statement prepared for ${teamSlipTarget.firstName} ${teamSlipTarget.lastName} · ${monthCount} month(s). Every month was rechecked against your authorized team payroll scope. Payroll records were not changed.`);
    } catch (caught) {
      if (!printWindow.closed) printWindow.close();
      setTeamSlipError(caught instanceof Error ? caught.message : "Unable to generate this team member salary statement.");
    } finally {
      setTeamSlipBusy(false);
    }
  }

  // Load the individual salary slip automatically on open and whenever either
  // month changes. Cleanup prevents an older, slower response from replacing
  // the data for a newer selection.
  useEffect(() => {
    if (!slipTarget) return;
    const target = slipTarget;
    let active = true;
    setSlipLoading(true);
    setSlipError("");
    setSlipPayload(null);

    async function loadSelectedSlipPeriod() {
      try {
        const count = validatePayslipRange(slipStartMonth, slipEndMonth, currentOrganizationMonth);
        const params = new URLSearchParams({ startMonth: slipStartMonth, endMonth: slipEndMonth });
        const result = await apiRequest<SalarySlipPayload>(`/payroll/payslips/${encodeURIComponent(target.employeeId)}?${params.toString()}`);
        if (!active) return;
        if (!result.employee || result.employee.id !== target.employeeId || result.startMonth !== slipStartMonth || result.endMonth !== slipEndMonth || !Array.isArray(result.months) || result.months.length !== count) {
          throw new Error("The individual salary-slip response was incomplete or did not match the selected month range.");
        }
        assertSalarySlipUsesOrganizationCurrency(result, organizationCurrencyCode);
        setSlipPayload(result);
      } catch (caught) {
        if (active) setSlipError(caught instanceof Error ? caught.message : "Unable to load the individual salary slip.");
      } finally {
        if (active) setSlipLoading(false);
      }
    }

    void loadSelectedSlipPeriod();
    return () => { active = false; };
  }, [slipTarget, slipStartMonth, slipEndMonth, currentOrganizationMonth, organizationCurrencyCode]);

  async function printIndividualSlip() {
    const target = slipTarget;
    if (!target || slipPrinting || slipLoading) return;
    try { validatePayslipRange(slipStartMonth, slipEndMonth, currentOrganizationMonth); }
    catch (caught) { setSlipError(caught instanceof Error ? caught.message : "Choose a valid salary-slip period."); return; }
    const printWindow = window.open("", "_blank");
    if (!printWindow) { setSlipError("Your browser blocked the salary-slip window. Allow pop-ups for this site and try again."); return; }
    printWindow.document.open();
    printWindow.document.write(buildPdfPreparationDocument("payslip", document.documentElement.dataset.theme === "dark" ? "dark" : "light"));
    printWindow.document.close();
    setSlipPrinting(true); setSlipError("");
    try {
      const params = new URLSearchParams({ startMonth: slipStartMonth, endMonth: slipEndMonth });
      const latest = await apiRequest<SalarySlipPayload>(`/payroll/payslips/${encodeURIComponent(target.employeeId)}?${params.toString()}`);
      const count = monthOrdinal(slipEndMonth) - monthOrdinal(slipStartMonth) + 1;
      if (!latest.employee || latest.employee.id !== target.employeeId || latest.startMonth !== slipStartMonth || latest.endMonth !== slipEndMonth || !Array.isArray(latest.months) || latest.months.length !== count) throw new Error("The latest salary-slip data was incomplete. Adjust the selected month range and try again.");
      assertSalarySlipUsesOrganizationCurrency(latest, organizationCurrencyCode);
      if (!printWindow.closed) {
        printWindow.document.open(); printWindow.document.write(buildSalarySlipDocument(latest)); printWindow.document.close();
        window.setTimeout(() => { if (!printWindow.closed) { printWindow.focus(); printWindow.print(); } }, 300);
      }
      setSlipPayload(latest);
      setNotice("Individual salary slip prepared from current payroll data. No payroll payment records were changed.");
      setSlipTarget(null);
    } catch (caught) {
      if (!printWindow.closed) printWindow.close();
      setSlipError(caught instanceof Error ? caught.message : "Unable to generate the individual salary slip.");
    } finally { setSlipPrinting(false); }
  }

  async function generateMultiMonthPayslips() {
    if (!canManage || bulkBusy) return;
    let monthCount = 0;
    try { monthCount = validatePayslipRange(bulkStartMonth, bulkEndMonth, currentOrganizationMonth); }
    catch (caught) { setBulkError(caught instanceof Error ? caught.message : "Choose a valid payroll period."); return; }
    const printWindow = window.open("", "_blank");
    if (!printWindow) { setBulkError("Your browser blocked the combined salary-slip window. Allow pop-ups for this site and try again."); return; }
    printWindow.document.open();
    printWindow.document.write(buildPdfPreparationDocument("payslip", document.documentElement.dataset.theme === "dark" ? "dark" : "light"));
    printWindow.document.close();
    setBulkBusy(true); setBulkError("");
    try {
      const params = new URLSearchParams({ startMonth: bulkStartMonth, endMonth: bulkEndMonth });
      const loadRoster = async () => {
        const result = await apiRequest<PayslipRoster>(`/payroll/payslips?${params.toString()}`);
        if (result.startMonth !== bulkStartMonth || result.endMonth !== bulkEndMonth || !Array.isArray(result.employees)) throw new Error("The authorized workforce response was incomplete.");
        if (result.limitExceeded) throw new Error(`This period exceeds the backend workforce limit${result.maxEmployees ? ` of ${result.maxEmployees} employees` : ""}. Shorten the selected month range.`);
        const seen = new Set<string>();
        const roster = result.employees.map((person) => {
          if (!person || typeof person.employeeId !== "string" || !person.employeeId || typeof person.firstName !== "string" || typeof person.lastName !== "string") throw new Error("The workforce list contained an invalid employee record. No combined report was printed.");
          if (seen.has(person.employeeId)) throw new Error("The workforce list contained a duplicate employee. No combined report was printed.");
          seen.add(person.employeeId);
          return person;
        });
        return roster.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "en", { sensitivity: "base", numeric: true }) || String(a.employeeCode || "").localeCompare(String(b.employeeCode || ""), "en", { numeric: true }));
      };
      const employees = await loadRoster();
      if (!employees.length) throw new Error("There are no eligible workforce members with payroll activity in the selected period.");
      const statements = employees.length * monthCount;
      if (employees.length > 500 || statements > 3000) throw new Error(`This report would create ${statements.toLocaleString()} employee-month statements. The limit is 3,000 statements and 500 employees; choose a shorter month range.`);
      const expectedMonths = Array.from({ length: monthCount }, (_, index) => monthFromOrdinal(monthOrdinal(bulkStartMonth) + index));
      const slips = new Map<string, SalarySlipPayload>();
      const concurrency = 3;
      for (let offset = 0; offset < employees.length; offset += concurrency) {
        const batch = employees.slice(offset, offset + concurrency);
        const results = await Promise.all(batch.map(async (employee) => {
          const query = new URLSearchParams({ startMonth: bulkStartMonth, endMonth: bulkEndMonth });
          const result = await apiRequest<SalarySlipPayload>(`/payroll/payslips/${encodeURIComponent(employee.employeeId)}?${query.toString()}`);
          if (!result.employee || result.employee.id !== employee.employeeId || result.startMonth !== bulkStartMonth || result.endMonth !== bulkEndMonth || !Array.isArray(result.months) || result.months.length !== monthCount || result.months.some((value, index) => value.month !== expectedMonths[index])) {
            const name = `${employee.firstName} ${employee.lastName}`.trim() || employee.employeeCode || "Employee";
            throw new Error(`The salary-slip data for ${name} was incomplete or did not match the selected month range.`);
          }
          try { assertSalarySlipUsesOrganizationCurrency(result, organizationCurrencyCode); }
          catch (caught) {
            const name = `${employee.firstName} ${employee.lastName}`.trim() || employee.employeeCode || "Employee";
            throw new Error(`The salary slip for ${name} cannot be generated: ${caught instanceof Error ? caught.message : "currency mismatch"}`);
          }
          return result;
        }));
        for (const result of results) slips.set(result.employee.id, result);
      }
      const latestRoster = await loadRoster();
      const initialIds = employees.map((person) => person.employeeId).sort();
      const latestIds = latestRoster.map((person) => person.employeeId).sort();
      if (initialIds.length !== latestIds.length || initialIds.some((id, index) => id !== latestIds[index])) throw new Error("The authorized workforce changed while the report was being prepared. No combined report was printed; reload and try again.");
      const ordered = employees.map((person) => slips.get(person.employeeId));
      if (ordered.some((value) => !value)) throw new Error("One or more salary slips were missing. No partial combined report was printed.");
      const payloads = ordered as SalarySlipPayload[];
      const paid = payloads.reduce((sum, payload) => sum + payload.months.filter((item) => item.payment.status === "PAID").length, 0);
      const total = employees.length * monthCount;
      if (printWindow.closed) throw new Error("The print window was closed before the combined salary slips were ready. Reopen the report and try again.");
      printWindow.document.open(); printWindow.document.write(buildSalarySlipDocument(payloads)); printWindow.document.close();
      window.setTimeout(() => { if (!printWindow.closed) { printWindow.focus(); printWindow.print(); } }, 300);
      setBulkOpen(false);
      setNotice(`Combined salary slips prepared for ${employees.length} workforce members across ${monthCount} month(s): ${paid} PAID and ${total - paid} UNPAID employee-month statements. Payment records were not changed.`);
    } catch (caught) {
      if (!printWindow.closed) printWindow.close();
      setBulkError(caught instanceof Error ? caught.message : "Unable to prepare the combined salary-slip report.");
    } finally { setBulkBusy(false); }
  }

  return <>
    <PageHeader eyebrow="Compensation" title={user.role === "EMPLOYEE" ? "My pay" : user.role === "DEPARTMENT_MANAGER" ? "Team payments" : "Salary payments"} description={user.role === "EMPLOYEE" ? "Review your calculated earnings and recorded monthly payment status." : "Review backend-calculated earnings, resolve rate issues, and track monthly payment status."} />
    {error ? <div role="alert" className="form-error" style={{ marginBottom: 14 }}>{error}</div> : null}
    {notice ? <div role="status" className="success-callout" style={{ marginBottom: 14 }}><CheckCircle2 size={15} />{notice}</div> : null}
    <div className="payroll-summary-grid" style={{ marginBottom: 16 }}>
      <Panel className="metric-card"><div className="metric-icon"><Wallet size={17} /></div><div className="metric-label">Paid this month</div><div className="metric-value">{!organizationCurrencyCode ? "—" : paidCurrencyMismatch ? "—" : formatMoney(paidTotal, organizationCurrencyCode)}</div><div className="metric-foot">{!organizationCurrencyCode ? "Organization currency unavailable" : paidCurrencyMismatch ? "Currency mismatch — total withheld" : `${paidPayments.length} recorded payments · ${month}`}</div></Panel>
      <Panel className="metric-card"><div className="metric-icon"><CircleDollarSign size={17} /></div><div className="metric-label">Outstanding amount</div><div className="metric-value">{!organizationCurrencyCode ? "—" : dueCurrencyMismatch ? "—" : formatMoney(dueTotal, organizationCurrencyCode)}</div><div className="metric-foot">{!organizationCurrencyCode ? "Organization currency unavailable" : dueCurrencyMismatch ? "Currency mismatch — total withheld" : `${duePayments.length} awaiting payment`}</div></Panel>
      <Panel className="metric-card"><div className="metric-icon"><AlertCircle size={17} /></div><div className="metric-label">Needs attention</div><div className="metric-value">{needsAttentionCount}</div><div className="metric-foot">{currencyMismatchCount ? `${currencyMismatchCount} currency mismatch(es)` : "Rate, currency, or payable-hours issue"}</div></Panel>
    </div>
    {currencyMismatchCount > 0 ? <div className="info-callout" role="status" style={{ marginBottom: 14 }}><AlertCircle size={15} /><span><strong>Payroll currency needs HR review.</strong> {currencyMismatchCount} workforce member(s) have rate or payment records outside the organization currency ({organizationCurrencyCode || "not configured"}). Their amounts and payslips are withheld rather than relabelled. Ask HR or the Organization Admin to reconcile the underlying pay-rate history before recording or generating valid monetary statements.</span></div> : null}
    <Panel>
      <div className="toolbar salary-payments-toolbar"><div className="salary-payments-controls"><label className="field salary-payments-month"><span className="field-label">Pay month</span><input className="text-input" type="month" value={month} max={currentOrganizationMonth} onChange={(e) => { setMonthTouchedByUser(true); setMonth(e.target.value); }} /></label>{user.role !== "EMPLOYEE" ? <label className="search-field salary-payments-search"><SearchIcon /><input aria-label="Search salary payments" placeholder="Search employee, department, reference…" value={search} onChange={(e) => setSearch(e.target.value)} /></label> : null}{canManage ? <Button className={`salary-payments-bulk-toggle${bulkOpen ? " is-open" : ""}`} size="sm" variant="secondary" leading={bulkOpen ? <ChevronUp size={14} /> : <FileDown size={14} />} onClick={() => { setBulkStartMonth(month); setBulkEndMonth(month); setBulkError(""); setBulkOpen((value) => !value); }}>{bulkOpen ? "Hide multi-month slips" : "Multi-month salary slips"}</Button> : null}</div><div className="toolbar-right"><span className="date-chip"><CalendarDays size={13} /> {timeZone}</span><span className="date-chip"><CircleDollarSign size={13} /> {organizationCurrencyCode || "Currency not configured"}</span><span style={{ color:"var(--muted)", fontSize:12 }}>{loading ? "Loading…" : `${payments.length} employees · ${payableCount} payable`}</span></div></div>
      {bulkOpen && canManage ? <section className="bulk-payslip-generator" aria-label="Combined payslip date range">
        <div className="bulk-payslip-generator-intro info-callout">
          <span className="bulk-payslip-generator-icon" aria-hidden="true"><FileDown size={17} /></span>
          <span><strong>Combined salary report</strong><small>Generate a print-ready statement for every employee in your authorized payroll scope. This report is read-only and does not change payment records.</small></span>
        </div>
        <div className="bulk-payslip-controls">
          <div className="bulk-payslip-date-range">
            <label className="field bulk-payslip-month-field"><span className="field-label">From month</span><input className="text-input" type="month" min="2000-01" max={bulkEndMonth || currentOrganizationMonth} value={bulkStartMonth} disabled={bulkBusy} onChange={(event) => { setBulkStartMonth(event.target.value); setBulkError(""); }} /></label>
            <span className="bulk-payslip-range-connector" aria-hidden="true"><ArrowRight size={16} /></span>
            <label className="field bulk-payslip-month-field"><span className="field-label">To month</span><input className="text-input" type="month" min={bulkStartMonth || "2000-01"} max={currentOrganizationMonth} value={bulkEndMonth} disabled={bulkBusy} onChange={(event) => { setBulkEndMonth(event.target.value); setBulkError(""); }} /></label>
          </div>
          <Button className="bulk-payslip-generate" variant="primary" leading={<FileDown size={15} />} busy={bulkBusy} disabled={!bulkStartMonth || !bulkEndMonth} onClick={() => void generateMultiMonthPayslips()}>Generate combined payslips</Button>
        </div>
        {bulkBusy ? <PdfPreparationIndicator label="Generating payslip(s)" className="pdf-preparation-indicator-workspace" /> : null}
        {bulkError ? <div className="form-error" role="alert" style={{ marginTop: 12 }}>{bulkError}</div> : null}
      </section> : null}
      {loading && !payments.length ? <div className="loading-state">Calculating monthly salary records…</div> : null}
      {!loading && !error && !visible.length ? <div className="empty-state"><div className="state-icon"><BadgeDollarSign size={18} /></div><h3>No salary records for this period</h3><p>There are no payment or payable-work records available for {month} in your authorized scope.</p></div> : null}
      {visible.length ? <div className="table-wrap"><table className="data-table"><thead><tr>{user.role !== "EMPLOYEE" ? <th>Employee</th> : null}<th>Hours</th><th>Calculated amount</th><th>Status</th><th>Payment reference</th><th>Paid date</th><th /></tr></thead><tbody>{visible.map((item) => {
        const currencyMatches = !paymentCurrencyMismatch(item);
        return <tr key={item.employeeId}>
        {user.role !== "EMPLOYEE" ? <td><div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}><ProfilePhoto employeeId={item.employeeId} name={`${item.firstName || ""} ${item.lastName || ""}`.trim() || item.employeeCode || "Employee"} className="user-avatar" /><span style={{ minWidth: 0 }}><span className="table-primary">{item.firstName} {item.lastName}</span><span className="table-secondary">{item.employeeCode} · {item.departmentName || humanize(item.workforceRole)}</span></span></div></td> : null}
        <td><span className="table-primary">{duration(item.workedMinutes)}</span><span className="table-secondary">{duration(item.payableMinutes)} payable</span></td>
        <td><span className="table-primary">{!currencyMatches ? "Amount withheld" : formatMoney(item.calculatedAmount, organizationCurrencyCode)}</span>{!currencyMatches ? <span className="table-secondary currency-mismatch-text">Pay-rate currency {normalizeCurrencyCode(item.currencyCode) || "unavailable"} does not match organization currency {organizationCurrencyCode || "not configured"}.</span> : item.status === "PAID" ? <span className="table-secondary">Recorded: {formatMoney(item.amount, organizationCurrencyCode)}</span> : null}</td>
        <td><StatusBadge value={item.status} />{!currencyMatches ? <span className="table-secondary currency-mismatch-text">Currency mismatch</span> : null}</td><td>{item.paymentReference || "—"}</td><td>{item.paidAt ? formatDate(item.paidAt, timeZone) : "—"}</td>
        <td><div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, flexWrap: "wrap" }}>{user.role === "DEPARTMENT_MANAGER" ? <Button size="sm" variant="ghost" leading={<FileDown size={13} />} onClick={() => openTeamMemberPayslip(item)}>Multi-month payslip</Button> : canManage && currencyMatches ? <Button size="sm" variant="ghost" leading={<FileDown size={13} />} onClick={() => openIndividualSlip(item)}>Payslip</Button> : null}{canManage && currencyMatches && ["UNPAID", "PAID"].includes(item.status) && item.calculatedAmount !== null ? <Button size="sm" variant={item.status === "PAID" ? "ghost" : "secondary"} onClick={() => openPayment(item)}>{item.status === "PAID" ? "Reverse paid" : "Record paid"}</Button> : null}</div></td>
      </tr>;
      })}</tbody></table></div> : null}
      <div className="table-footer"><span>Payment records are scoped by your role and department.</span><span>Calculations are provided by the backend; HRMS does not transfer money.</span></div>
    </Panel>
    {user.role === "EMPLOYEE" ? <div style={{ marginTop: 16 }}><PersonalEarningsWorkspace embedded monthOverride={month} /></div> : null}
    <Drawer open={Boolean(selected)} title={targetStatus === "PAID" ? "Record salary as paid" : "Reverse paid status"} description="Review the employee, amount, currency, and period before recording a payment status change." onClose={() => setSelected(null)} width="standard" footer={<><Button variant="secondary" onClick={() => setSelected(null)}>Cancel</Button><Button variant={targetStatus === "PAID" ? "primary" : "danger"} busy={saving} onClick={() => document.querySelector<HTMLFormElement>("#salary-payment-form")?.requestSubmit()}>{targetStatus === "PAID" ? "Confirm paid status" : "Confirm reversal"}</Button></>}>
      {selected ? <form id="salary-payment-form" onSubmit={savePayment}>
        <section className="payment-review-summary" aria-label="Payment confirmation summary">
          <div className="payment-review-employee">
            <ProfilePhoto name={`${selected.firstName || ""} ${selected.lastName || ""}`.trim() || "Workforce member"} employeeId={selected.employeeId} className="user-avatar" />
            <div className="payment-review-employee-copy">
              <span>Workforce member</span>
              <strong>{selected.firstName} {selected.lastName}</strong>
              <small>{selected.employeeCode || "Employee code unavailable"}</small>
            </div>
          </div>
          <div className="payment-review-grid">
            <div><span>Pay period</span><strong>{month}</strong></div>
            <div><span>Worked hours</span><strong>{duration(selected.workedMinutes)}</strong></div>
            <div className="payment-review-amount"><span>Calculated payable amount</span><strong>{formatMoney(selected.calculatedAmount, organizationCurrencyCode)}</strong></div>
            <div><span>New status</span><div className="payment-review-status"><StatusBadge value={targetStatus} /></div></div>
          </div>
        </section>
        <Field label="Payment reference" hint="Optional · up to 120 characters"><TextInput maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        <Field label="Notes" hint="Optional · up to 1,000 characters"><TextArea maxLength={1000} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="form-note"><AlertCircle size={15} /> This records the payment state only. Confirm that the actual payment has been made outside HRMS before marking it paid.</div>
      </form> : null}
    </Drawer>
    <Drawer open={Boolean(teamSlipTarget)} title="Generate multi-month team member payslip" description="Select a period for this workforce member. Every monthly request is checked by the backend against your currently assigned departments." onClose={() => { if (!teamSlipBusy) { setTeamSlipTarget(null); setTeamSlipError(""); } }} width="standard" footer={<><Button variant="secondary" disabled={teamSlipBusy} onClick={() => setTeamSlipTarget(null)}>Cancel</Button><Button variant="primary" leading={<FileDown size={14} />} busy={teamSlipBusy} disabled={!teamSlipStartMonth || !teamSlipEndMonth || teamSlipStartMonth > teamSlipEndMonth} onClick={() => void generateTeamMemberPayslip()}>Generate & print payslip</Button></>}>
      {teamSlipTarget ? <div className="form-section">
        <section className="team-slip-member-card" aria-label="Selected workforce member">
          <div className="team-slip-member-identity">
            <ProfilePhoto name={`${teamSlipTarget.firstName} ${teamSlipTarget.lastName}`.trim()} employeeId={teamSlipTarget.employeeId} className="user-avatar" />
            <div className="team-slip-member-name">
              <span>Workforce member</span>
              <strong>{teamSlipTarget.firstName} {teamSlipTarget.lastName}</strong>
              <small>{teamSlipTarget.employeeCode || "Employee code unavailable"}</small>
            </div>
          </div>
          <div className="team-slip-member-meta">
            <div><span>Department</span><strong>{teamSlipTarget.departmentName || "Not assigned"}</strong></div>
            <div><span>Organization currency</span><strong>{organizationCurrencyCode || "Unavailable"}</strong></div>
          </div>
        </section>
        <section className="team-slip-period" aria-label="Payslip date range">
          <div className="team-slip-section-heading">
            <strong>Statement period</strong>
            <span>Choose inclusive start and end months</span>
          </div>
          <div className="team-slip-month-grid">
            <Field label="From month"><TextInput type="month" min="2000-01" max={teamSlipEndMonth || currentOrganizationMonth} value={teamSlipStartMonth} disabled={teamSlipBusy} onChange={(event) => { setTeamSlipStartMonth(event.target.value); setTeamSlipError(""); }} /></Field>
            <Field label="To month"><TextInput type="month" min={teamSlipStartMonth || "2000-01"} max={currentOrganizationMonth} value={teamSlipEndMonth} disabled={teamSlipBusy} onChange={(event) => { setTeamSlipEndMonth(event.target.value); setTeamSlipError(""); }} /></Field>
          </div>
        </section>
        <div className="team-slip-note"><span className="team-slip-note-icon"><AlertCircle size={16} /></span><p>This manager statement includes backend-calculated monthly hours, payable time, calculated pay and payment status. The detailed daily payslip remains available to HR Managers and Organization Admins. You can include up to 24 months.</p></div>
        {teamSlipTarget.currencyMismatch || !paymentUsesOrganizationCurrency(teamSlipTarget.currencyCode, organizationCurrencyCode, teamSlipTarget.currencyMismatch) ? <div role="alert" className="form-error">This employee currently has a pay-rate currency mismatch ({normalizeCurrencyCode(teamSlipTarget.currencyCode) || "unavailable"} vs {organizationCurrencyCode || "organization currency unavailable"}). The statement cannot include a misleading amount until HR resolves the underlying rate history.</div> : null}
        {teamSlipBusy ? <PdfPreparationIndicator label="Generating payslip(s)" /> : null}{teamSlipError ? <div role="alert" className="form-error">{teamSlipError}</div> : null}
      </div> : null}
    </Drawer>
    <Drawer open={Boolean(slipTarget)} title="Generate individual salary slip" description="Choose the statement period. The latest payroll details load automatically whenever either selected month changes and are refreshed again before printing." onClose={() => { if (!slipLoading && !slipPrinting) { setSlipTarget(null); setSlipPayload(null); setSlipError(""); } }} width="standard" footer={<><Button variant="secondary" disabled={slipLoading || slipPrinting} onClick={() => { setSlipTarget(null); setSlipPayload(null); }}>Cancel</Button><Button variant="primary" leading={<FileDown size={14} />} busy={slipPrinting} disabled={!slipPayload || slipLoading} onClick={() => void printIndividualSlip()}>Generate & print</Button></>}>
      {slipTarget ? <div className="form-section">
        <section className="salary-slip-person-card" aria-label="Selected workforce member">
          <div className="salary-slip-person-identity">
            <ProfilePhoto name={`${slipTarget.firstName} ${slipTarget.lastName}`.trim()} employeeId={slipTarget.employeeId} className="user-avatar" />
            <div className="salary-slip-person-name">
              <span>Workforce member</span>
              <strong>{slipTarget.firstName} {slipTarget.lastName}</strong>
              <small>{slipTarget.employeeCode || "Employee code unavailable"}</small>
            </div>
          </div>
          <div className="salary-slip-person-meta">
            <div><span>Department</span><strong>{slipTarget.departmentName || "Not assigned"}</strong></div>
            <div><span>Organization currency</span><strong>{organizationCurrencyCode || "Unavailable"}</strong></div>
          </div>
        </section>
        <section className="salary-slip-period" aria-label="Payslip date range">
          <div className="salary-slip-period-heading">
            <strong>Statement period</strong>
            <span>Choose inclusive start and end months</span>
          </div>
          <div className="salary-slip-month-grid">
            <Field label="From month"><TextInput type="month" min="2000-01" max={slipEndMonth || currentOrganizationMonth} value={slipStartMonth} disabled={slipLoading || slipPrinting} onChange={(event) => { setSlipStartMonth(event.target.value); setSlipPayload(null); setSlipError(""); }} /></Field>
            <Field label="To month"><TextInput type="month" min={slipStartMonth || "2000-01"} max={currentOrganizationMonth} value={slipEndMonth} disabled={slipLoading || slipPrinting} onChange={(event) => { setSlipEndMonth(event.target.value); setSlipPayload(null); setSlipError(""); }} /></Field>
          </div>
        </section>
        {slipError ? <div className="form-error" role="alert">{slipError}</div> : null}
        {slipPrinting ? <PdfPreparationIndicator label="Generating payslip(s)" /> : slipLoading ? <PdfPreparationIndicator label="Loading payslip details" /> : slipPayload ? <div className="success-callout"><CheckCircle2 size={15} /> Loaded {slipPayload.months.length} monthly statement(s) for {slipPayload.employee.firstName} {slipPayload.employee.lastName}. The print action refreshes the latest payroll data.</div> : !slipError ? <div className="form-note"><AlertCircle size={15} /> Each selected month is printed as a separate monthly statement. Up to 24 months can be included.</div> : null}
      </div> : null}
    </Drawer>
  </>;
}

function SearchIcon() { return <span aria-hidden="true">⌕</span>; }
