"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { BadgeDollarSign, CheckCircle2, RefreshCw, Search, Clock3, AlertTriangle, CheckCircle, CircleDollarSign, Printer, FileDown, ChevronDown, ChevronLeft, ChevronRight, Eye, Pencil, LockKeyhole, Users } from "lucide-react";
import { buildSalarySlipDocument, type SalarySlipPayload } from "./salary-slip-document";
import { buildPayrollRegisterDocument } from "./payroll-register-document";
import EmployeeProfilePhoto from "../employee/EmployeeProfilePhoto";
import { useWorkspaceAutoRefresh } from "../shared/useWorkspaceAutoRefresh";

type Payment = { id?: string | null; employeeId: string; employeeCode?: string | null; firstName?: string | null; lastName?: string | null; departmentName?: string | null; workforceRole?: string | null; payMonth: string; amount: string | number | null; calculatedAmount?: string | number | null; workedMinutes?: number; payableMinutes?: number; paidLeaveMinutes?: number; paidHolidayMinutes?: number; calculatedRegularAmount?: string | number | null; calculatedOvertimeAmount?: string | number | null; calculatedPaidAbsenceAmount?: string | number | null; currencyCode: string; status: "PAID" | "UNPAID" | "NO_RECORDED_HOURS" | "RATE_REQUIRED" | "CURRENCY_MISMATCH"; currencyMismatch?: boolean; paidAt?: string | null; paymentReference?: string | null; notes?: string | null; paymentRecorded?: boolean; recordedByUserId?: string | null; recordedBy?: string | null; createdAt?: string | null; updatedAt?: string | null };
type Props = { audience: "hr-manager" | "organization-admin" | "department-manager" | "employee"; employeeId?: string; excludeEmployeeId?: string };
type PayslipDialogState = {
  employeeId: string;
  employeeName: string;
  startMonth: string;
  endMonth: string;
  payload: SalarySlipPayload;
};
type BulkPayslipEmployee = {
  employeeId: string;
  employeeCode: string | null;
  firstName: string;
  lastName: string;
  departmentName: string | null;
  workforceRole: string | null;
};
type BulkPayslipProgress = { phase: "scope" | "slips" | "verify"; completed: number; total: number };
const MAX_BULK_SLIP_STATEMENTS = 3000;
function isPayrollMonth(value: string) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
function payrollMonthOrdinal(value: string) { const [year, month] = value.split("-").map(Number); return year * 12 + month - 1; }
function payrollMonthFromOrdinal(value: number) { const year = Math.floor(value / 12); const month = value % 12 + 1; return String(year) + "-" + String(month).padStart(2, "0"); }
const INPUT = "mt-1.5 w-full rounded-xl border border-slate-700 bg-[#0b111b] px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-400";
const BUTTON = "inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold !text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 [&>svg]:!text-white";
function localDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function monthNow() { return localDate().slice(0, 7); }
function money(value: string | number | null, currency: string) { if (value === null || value === "") return "Not recorded"; const n = Number(value); if (!Number.isFinite(n)) return "—"; try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n); } catch { return `${currency} ${n.toFixed(2)}`; } }
function formatPayrollTimestamp(value: string | null | undefined, timeZone: string, withTime = true): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" as const } : {}),
    timeZone: timeZone || "Africa/Kigali",
  };
  try {
    return new Intl.DateTimeFormat(undefined, options).format(date);
  } catch {
    const fallbackOptions: Intl.DateTimeFormatOptions = {
      dateStyle: "medium",
      ...(withTime ? { timeStyle: "short" as const } : {}),
    };
    return new Intl.DateTimeFormat(undefined, fallbackOptions).format(date);
  }
}
export default function SalaryPaymentsWorkspace({ audience, employeeId, excludeEmployeeId }: Props) {
  const canEdit = audience === "hr-manager" || audience === "organization-admin";
  const [month, setMonth] = useState("");
  const [monthReady, setMonthReady] = useState(false);
  const [organizationTimeZone, setOrganizationTimeZone] = useState("");
  const [dateWarning, setDateWarning] = useState("");
  const [payslipLoading, setPayslipLoading] = useState("");
  const [payslipDialog, setPayslipDialog] = useState<PayslipDialogState | null>(null);
  const [generatingPayslip, setGeneratingPayslip] = useState(false);
  const [bulkPayslipOpen, setBulkPayslipOpen] = useState(false);
  const [bulkStartMonth, setBulkStartMonth] = useState("");
  const [bulkEndMonth, setBulkEndMonth] = useState("");
  const [bulkPayslipLoading, setBulkPayslipLoading] = useState(false);
  const [bulkPayslipError, setBulkPayslipError] = useState("");
  const [bulkPayslipProgress, setBulkPayslipProgress] = useState<BulkPayslipProgress | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [paymentConfirmation, setPaymentConfirmation] = useState<Payment | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<"ALL" | "UNPAID" | "PAID" | "REVIEW" | "NO_HOURS">("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [sortOption, setSortOption] = useState<"NAME_ASC" | "NAME_DESC" | "AMOUNT_DESC" | "AMOUNT_ASC" | "STATUS">("NAME_ASC");
  const [expandedEmployeeId, setExpandedEmployeeId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [drafts, setDrafts] = useState<Record<string, { amount: string; currencyCode: string; status: "PAID" | "UNPAID"; paymentReference: string; notes: string }>>({});
  const loadRequestId = useRef(0);
  const paymentConfirmationRef = useRef<HTMLElement | null>(null);
  const paymentDialogPreviousFocusRef = useRef<HTMLElement | null>(null);
  const payslipPrintWindowRef = useRef<Window | null>(null);
  const bulkPayslipPrintWindowRef = useRef<Window | null>(null);
  const payslipDialogRef = useRef<HTMLElement | null>(null);
  const payslipDialogBusyRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    async function resolveOrganizationMonth() {
      try {
        const seedDate = localDate();
        const response = await fetch(
          `/api/backend/attendance/calendar?fromDate=${encodeURIComponent(seedDate)}&toDate=${encodeURIComponent(seedDate)}`,
          { credentials: "same-origin", cache: "no-store" },
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || "Unable to load organization date settings.");
        const today = typeof payload?.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.today)
          ? payload.today
          : "";
        if (!today) throw new Error("The organization work date was unavailable.");
        if (!cancelled) {
          setOrganizationTimeZone(typeof payload?.timeZone === "string" ? payload.timeZone : "");
          setMonth(today.slice(0, 7));
          setBulkStartMonth(today.slice(0, 7));
          setBulkEndMonth(today.slice(0, 7));
          setDateWarning("");
        }
      } catch {
        if (!cancelled) {
          const fallbackMonth = monthNow();
          setMonth(fallbackMonth);
          setBulkStartMonth(fallbackMonth);
          setBulkEndMonth(fallbackMonth);
          setDateWarning("Organization date settings could not be loaded. The payroll month is using your device date; verify the selected month before recording payments.");
        }
      } finally {
        if (!cancelled) setMonthReady(true);
      }
    }
    void resolveOrganizationMonth();
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!monthReady) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      setLoading(false);
      if (!silent) setError("Select a valid payroll month before loading salary payments.");
      return;
    }
    const requestId = ++loadRequestId.current;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const response = await fetch(
        `/api/backend/payroll/payments?month=${encodeURIComponent(month)}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const payload = await response.json().catch(() => null);
      if (requestId !== loadRequestId.current) return;
      if (!response.ok) throw new Error(payload?.message || `Request failed (${response.status})`);
      const responseRows = Array.isArray(payload?.payments) ? payload.payments as Payment[] : [];
      // The payment API applies tenant, role and department authorization before
      // returning rows. Keep only the current employee / team refinement here.
      const rows = audience === "employee" && employeeId
        ? responseRows.filter((payment) => payment.employeeId === employeeId)
        : audience === "department-manager" && excludeEmployeeId
          ? responseRows.filter((payment) => payment.employeeId !== excludeEmployeeId)
          : responseRows;
      setPayments(rows);
      setDrafts(Object.fromEntries(rows.map((p) => [p.employeeId, { amount: p.amount == null ? "" : String(p.amount), currencyCode: p.currencyCode || "RWF", status: p.status === "PAID" ? "PAID" : "UNPAID", paymentReference: p.paymentReference || "", notes: p.notes || "" }])));
    } catch (e) {
      if (requestId === loadRequestId.current) {
        // A background refresh failure must not erase the last known payroll view.
        if (!silent) {
          setPayments([]);
          setDrafts({});
        }
        setError(e instanceof Error ? e.message : "Unable to load salary payments.");
      }
    }
    finally { if (requestId === loadRequestId.current) setLoading(false); }
  }, [month, monthReady, audience, employeeId, excludeEmployeeId]);
  useEffect(() => {
    void load();
    return () => { loadRequestId.current += 1; };
  }, [load]);

  useEffect(() => {
    if (!paymentConfirmation) return;
    paymentDialogPreviousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    paymentConfirmationRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) { event.preventDefault(); setPaymentConfirmation(null); }
      if (event.key !== "Tab" || !paymentConfirmationRef.current) return;
      const items = Array.from(paymentConfirmationRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); paymentDialogPreviousFocusRef.current?.focus(); };
  }, [paymentConfirmation, saving]);

  const payslipDialogOpen = Boolean(payslipDialog);
  useEffect(() => {
    payslipDialogBusyRef.current = generatingPayslip || Boolean(payslipLoading);
  }, [generatingPayslip, payslipLoading]);

  useEffect(() => {
    if (!payslipDialogOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    payslipDialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (payslipDialogBusyRef.current) return;
        if (payslipPrintWindowRef.current && !payslipPrintWindowRef.current.closed) {
          payslipPrintWindowRef.current.close();
        }
        payslipPrintWindowRef.current = null;
        setPayslipDialog(null);
        return;
      }
      if (event.key !== "Tab" || !payslipDialogRef.current) return;
      const items = Array.from(payslipDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (!items.length) {
        event.preventDefault();
        payslipDialogRef.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeElement = document.activeElement;
      if (!payslipDialogRef.current.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (activeElement === first || activeElement === payslipDialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [payslipDialogOpen]);

  const hasUnsavedChanges = canEdit && payments.some((payment) => {
    const draft = drafts[payment.employeeId];
    return !draft ||
      draft.amount !== (payment.amount == null ? "" : String(payment.amount)) ||
      draft.currencyCode !== (payment.currencyCode || "RWF") ||
      draft.status !== (payment.status === "PAID" ? "PAID" : "UNPAID") ||
      draft.paymentReference !== (payment.paymentReference || "") ||
      draft.notes !== (payment.notes || "");
  });

  useWorkspaceAutoRefresh(() => load(true), {
    enabled: true,
    intervalMs: 60_000,
    shouldRefresh: () => monthReady && Boolean(month) && !loading && !saving && !bulkPayslipLoading && !paymentConfirmation && !hasUnsavedChanges,
  });
  const paidCount = payments.filter((payment) => payment.status === "PAID").length;
  const noHoursCount = payments.filter((payment) => payment.status === "NO_RECORDED_HOURS").length;
  const unpaidCount = payments.filter((payment) => payment.status === "UNPAID").length;
  const rateRequiredCount = payments.filter((payment) => payment.status === "RATE_REQUIRED").length;
  const currencyMismatchCount = payments.filter((payment) => payment.status === "CURRENCY_MISMATCH").length;
  const needsReviewCount = rateRequiredCount + currencyMismatchCount;
  const currencySummaries = useMemo(() => {
    const summary = new Map<string, { currencyCode: string; total: number; paid: number; outstanding: number; paidCount: number; unpaidCount: number }>();
    for (const payment of payments) {
      const currencyCode = (payment.currencyCode || "RWF").toUpperCase();
      const current = summary.get(currencyCode) || { currencyCode, total: 0, paid: 0, outstanding: 0, paidCount: 0, unpaidCount: 0 };
      if (payment.status === "PAID") {
        current.paid += Number(payment.amount || 0);
        current.total += Number(payment.amount || 0);
        current.paidCount += 1;
      } else if (payment.status === "UNPAID") {
        current.outstanding += Number(payment.calculatedAmount ?? payment.amount ?? 0);
        current.total += Number(payment.calculatedAmount ?? payment.amount ?? 0);
        current.unpaidCount += 1;
      }
      summary.set(currencyCode, current);
    }
    return [...summary.values()].sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
  }, [payments]);
  const departments = useMemo(
    () => [...new Set(payments.map((payment) => payment.departmentName?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)),
    [payments],
  );

  const visiblePayments = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    const filtered = payments.filter((payment) => {
      const name = [payment.firstName, payment.lastName].filter(Boolean).join(" ") || payment.employeeCode || "Employee";
      const matchesSearch = !query || [name, payment.employeeCode, payment.departmentName, payment.workforceRole, payment.paymentReference]
        .some((value) => String(value ?? "").toLocaleLowerCase().includes(query));
      const matchesDepartment = departmentFilter === "ALL" || payment.departmentName === departmentFilter;
      const matchesFilter = paymentFilter === "ALL"
        || (paymentFilter === "PAID" && payment.status === "PAID")
        || (paymentFilter === "UNPAID" && payment.status === "UNPAID")
        || (paymentFilter === "REVIEW" && (payment.status === "RATE_REQUIRED" || payment.status === "CURRENCY_MISMATCH"))
        || (paymentFilter === "NO_HOURS" && payment.status === "NO_RECORDED_HOURS");
      return matchesSearch && matchesDepartment && matchesFilter;
    });
    const nameOf = (payment: Payment) => [payment.firstName, payment.lastName].filter(Boolean).join(" ") || payment.employeeCode || "Employee";
    const amountOf = (payment: Payment) => Number(payment.status === "PAID" ? payment.amount ?? 0 : payment.calculatedAmount ?? payment.amount ?? 0);
    const statusRank = (payment: Payment) => payment.status === "UNPAID" ? 0 : payment.status === "RATE_REQUIRED" || payment.status === "CURRENCY_MISMATCH" ? 1 : payment.status === "NO_RECORDED_HOURS" ? 2 : 3;
    return filtered.sort((a, b) => {
      if (sortOption === "NAME_DESC") return nameOf(b).localeCompare(nameOf(a), undefined, { sensitivity: "base" });
      if (sortOption === "AMOUNT_DESC") return (a.currencyCode || "RWF").localeCompare(b.currencyCode || "RWF") || amountOf(b) - amountOf(a) || nameOf(a).localeCompare(nameOf(b));
      if (sortOption === "AMOUNT_ASC") return (a.currencyCode || "RWF").localeCompare(b.currencyCode || "RWF") || amountOf(a) - amountOf(b) || nameOf(a).localeCompare(nameOf(b));
      if (sortOption === "STATUS") return statusRank(a) - statusRank(b) || nameOf(a).localeCompare(nameOf(b));
      return nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: "base" });
    });
  }, [payments, searchQuery, paymentFilter, departmentFilter, sortOption]);
  const pageCount = Math.max(1, Math.ceil(visiblePayments.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagePayments = visiblePayments.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
    setExpandedEmployeeId("");
  }, [month, searchQuery, paymentFilter, departmentFilter, sortOption, pageSize]);

  function exportPayrollRegister() {
    if (loading || visiblePayments.length === 0) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("Your browser blocked the payroll register PDF window. Allow pop-ups for this site and try again.");
      return;
    }

    setError("");
    setNotice("");
    const employeeRows = visiblePayments.map((payment) => {
      const employeeName = [payment.firstName, payment.lastName].filter(Boolean).join(" ") || payment.employeeCode || "Employee";
      const amount = payment.status === "PAID" ? payment.amount : payment.calculatedAmount ?? payment.amount;
      return {
        employeeName,
        employeeCode: payment.employeeCode || "",
        departmentName: payment.departmentName || "",
        workforceRole: payment.workforceRole || "",
        workedMinutes: payment.workedMinutes || 0,
        payableMinutes: payment.payableMinutes || 0,
        status: payment.status,
        amount,
        currencyCode: payment.currencyCode || "RWF",
        paidAt: payment.paidAt || null,
        paymentReference: payment.paymentReference || "",
        recordedBy: payment.recordedBy || "",
        notes: payment.notes || "",
      };
    });
    const audienceLabel = audience === "organization-admin"
      ? "Organization-wide payroll"
      : audience === "hr-manager"
        ? "HR Manager permitted payroll scope"
        : audience === "department-manager"
          ? "Managed-department payroll"
          : "Personal payroll";
    printWindow.document.open();
    printWindow.document.write(buildPayrollRegisterDocument({
      month,
      generatedAt: new Date().toISOString(),
      timeZone: organizationTimeZone || "Africa/Kigali",
      audienceLabel,
      rows: employeeRows,
    }));
    printWindow.document.close();

    const printWhenReady = () => {
      if (printWindow.closed) return;
      printWindow.focus();
      printWindow.document.getElementById("payroll-register-print")?.addEventListener("click", () => {
        if (!printWindow.closed) {
          printWindow.focus();
          printWindow.print();
        }
      }, { once: true });
      printWindow.print();
    };
    if (printWindow.document.readyState === "complete") {
      window.setTimeout(printWhenReady, 250);
    } else {
      printWindow.addEventListener("load", () => window.setTimeout(printWhenReady, 250), { once: true });
    }
    setNotice("Payroll register opened for printing or saving as PDF.");
  }

  async function printSalarySlip(targetEmployeeId: string) {
    if (!canEdit || !targetEmployeeId || payslipLoading || payslipDialog) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      setError("Choose a valid payroll month before preparing a salary slip.");
      return;
    }

    setPayslipLoading(targetEmployeeId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/backend/payroll/payslips/${encodeURIComponent(targetEmployeeId)}?startMonth=${encodeURIComponent(month)}&endMonth=${encodeURIComponent(month)}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const payload = await response.json().catch(() => null) as SalarySlipPayload | { message?: string } | null;
      if (!response.ok) {
        const message = payload && "message" in payload && typeof payload.message === "string"
          ? payload.message
          : `Unable to generate salary slip (${response.status}).`;
        throw new Error(message);
      }
      if (!payload || !("months" in payload) || !Array.isArray(payload.months) || payload.months.length === 0) {
        throw new Error("The salary slip response was incomplete. Please try again.");
      }
      const employeeName = [payload.employee.firstName, payload.employee.lastName].filter(Boolean).join(" ") || "Workforce member";
      setPayslipDialog({
        employeeId: targetEmployeeId,
        employeeName,
        startMonth: month,
        endMonth: month,
        payload,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate salary slip.");
    } finally {
      setPayslipLoading("");
    }
  }

  async function loadSalarySlipPeriod() {
    const dialog = payslipDialog;
    if (!dialog || payslipLoading || generatingPayslip) return;
    const validMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
    if (!validMonth(dialog.startMonth) || !validMonth(dialog.endMonth)) {
      setError("Choose valid start and end months for the salary slip.");
      return;
    }
    const monthOrdinal = (value: string) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
    const startOrdinal = monthOrdinal(dialog.startMonth);
    const endOrdinal = monthOrdinal(dialog.endMonth);
    if (startOrdinal > endOrdinal) {
      setError("The start month must be before or equal to the end month.");
      return;
    }
    if (endOrdinal - startOrdinal + 1 > 24) {
      setError("A salary slip can cover at most 24 months at a time.");
      return;
    }

    payslipDialogBusyRef.current = true;
    setPayslipLoading(dialog.employeeId);
    setError("");
    try {
      const query = new URLSearchParams({ startMonth: dialog.startMonth, endMonth: dialog.endMonth });
      const response = await fetch(
        `/api/backend/payroll/payslips/${encodeURIComponent(dialog.employeeId)}?${query.toString()}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const payload = await response.json().catch(() => null) as SalarySlipPayload | { message?: string } | null;
      if (!response.ok) {
        throw new Error(payload && "message" in payload && typeof payload.message === "string"
          ? payload.message
          : `Unable to load the selected payroll period (${response.status}).`);
      }
      if (!payload || !("months" in payload) || !Array.isArray(payload.months) || payload.months.length === 0) {
        throw new Error("The selected salary slip period returned no monthly records.");
      }
      setPayslipDialog((current) => current && current.employeeId === dialog.employeeId
        ? { ...current, payload }
        : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load the selected payroll period.");
    } finally {
      payslipDialogBusyRef.current = Boolean(generatingPayslip);
      setPayslipLoading("");
    }
  }

  async function generateAndPrintSalarySlip() {
    const dialog = payslipDialog;
    if (!dialog || generatingPayslip || payslipLoading) return;
    if (dialog.startMonth !== dialog.payload.startMonth || dialog.endMonth !== dialog.payload.endMonth) {
      setError("Load the selected payroll period before generating the salary slip.");
      return;
    }

    const validMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
    const monthOrdinal = (value: string) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
    if (!validMonth(dialog.startMonth) || !validMonth(dialog.endMonth)) {
      setError("Choose valid start and end months for the salary slip.");
      return;
    }
    const startOrdinal = monthOrdinal(dialog.startMonth);
    const endOrdinal = monthOrdinal(dialog.endMonth);
    if (startOrdinal > endOrdinal || endOrdinal - startOrdinal + 1 > 24) {
      setError("Choose a valid payroll period of no more than 24 months.");
      return;
    }

    // Open the print window directly from this user action to avoid popup blocking.
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("Your browser blocked the salary slip window. Allow pop-ups for this site and try again.");
      return;
    }
    payslipPrintWindowRef.current = printWindow;
    printWindow.document.open();
    printWindow.document.write("<!doctype html><html><head><title>Preparing salary slip</title></head><body style='font-family:Arial,sans-serif;padding:32px;color:#24354a'><h2>Preparing salary slip…</h2><p>Reading the latest payroll payment statuses.</p></body></html>");
    printWindow.document.close();

    payslipDialogBusyRef.current = true;
    setGeneratingPayslip(true);
    setError("");
    setNotice("");
    try {
      // Read the ledger again immediately before printing. This keeps the slip current
      // without writing or changing any monthly salary payment records.
      const query = new URLSearchParams({
        startMonth: dialog.startMonth,
        endMonth: dialog.endMonth,
      });
      const response = await fetch(
        `/api/backend/payroll/payslips/${encodeURIComponent(dialog.employeeId)}?${query.toString()}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const payload = await response.json().catch(() => null) as SalarySlipPayload | { message?: string } | null;
      if (!response.ok) {
        throw new Error(payload && "message" in payload && typeof payload.message === "string"
          ? payload.message
          : `Unable to generate salary slip (${response.status}).`);
      }
      if (
        !payload ||
        !("months" in payload) ||
        !payload.employee ||
        payload.employee.id !== dialog.employeeId ||
        payload.startMonth !== dialog.startMonth ||
        payload.endMonth !== dialog.endMonth ||
        !Array.isArray(payload.months) ||
        payload.months.length !== endOrdinal - startOrdinal + 1
      ) {
        throw new Error("The latest payroll data was incomplete. Reload the selected period and try again.");
      }

      if (!printWindow.closed) {
        printWindow.document.open();
        printWindow.document.write(buildSalarySlipDocument(payload));
        printWindow.document.close();

        const printWhenReady = () => {
          if (printWindow.closed) return;
          printWindow.focus();
          printWindow.document.getElementById("salary-slip-print")?.addEventListener("click", () => {
            if (!printWindow.closed) {
              printWindow.focus();
              printWindow.print();
            }
          }, { once: true });
          printWindow.print();
        };
        if (printWindow.document.readyState === "complete") {
          window.setTimeout(printWhenReady, 250);
        } else {
          printWindow.addEventListener("load", () => window.setTimeout(printWhenReady, 250), { once: true });
        }

        const paidCount = payload.months.filter((item) => item.payment.status === "PAID").length;
        const unpaidCount = payload.months.length - paidCount;
        setNotice(`Salary slip generated from current payroll statuses: ${paidCount} PAID and ${unpaidCount} UNPAID. No payroll records were changed.`);
      } else {
        setNotice("Salary slip data was loaded, but the print window was closed. Select Generate & print again.");
      }
      setPayslipDialog(null);
      payslipPrintWindowRef.current = null;
    } catch (caught) {
      if (!printWindow.closed) printWindow.close();
      payslipPrintWindowRef.current = null;
      setError(caught instanceof Error ? caught.message : "Unable to generate the salary slip.");
    } finally {
      payslipDialogBusyRef.current = Boolean(payslipLoading);
      setGeneratingPayslip(false);
    }
  }

  function cancelSalarySlipPreparation() {
    if (generatingPayslip || payslipLoading) return;
    if (payslipPrintWindowRef.current && !payslipPrintWindowRef.current.closed) {
      payslipPrintWindowRef.current.close();
    }
    payslipPrintWindowRef.current = null;
    setPayslipDialog(null);
  }


  function applyBulkPayslipPreset(months: number) {
    if (!isPayrollMonth(month)) return;
    const endOrdinal = payrollMonthOrdinal(month);
    const startOrdinal = Math.max(payrollMonthOrdinal("2000-01"), endOrdinal - months + 1);
    setBulkStartMonth(payrollMonthFromOrdinal(startOrdinal));
    setBulkEndMonth(month);
    setBulkPayslipError("");
  }

  async function generateBulkSalarySlips() {
    if (!canEdit || bulkPayslipLoading || payslipLoading || payslipDialog || generatingPayslip) return;
    if (hasUnsavedChanges) {
      setBulkPayslipError("Save or discard the unsaved payment edits before generating workforce salary slips.");
      return;
    }
    if (!isPayrollMonth(bulkStartMonth) || !isPayrollMonth(bulkEndMonth)) {
      setBulkPayslipError("Choose valid From month and To month values.");
      return;
    }

    const startOrdinal = payrollMonthOrdinal(bulkStartMonth);
    const endOrdinal = payrollMonthOrdinal(bulkEndMonth);
    if (startOrdinal > endOrdinal) {
      setBulkPayslipError("The From month must be before or equal to the To month.");
      return;
    }
    const monthCount = endOrdinal - startOrdinal + 1;
    if (monthCount > 24) {
      setBulkPayslipError("A combined salary-slip report can cover at most 24 months.");
      return;
    }
    if (isPayrollMonth(month) && endOrdinal > payrollMonthOrdinal(month)) {
      setBulkPayslipError("Future payroll months cannot be included. Select a range ending no later than the current organization month.");
      return;
    }

    // Open the print window directly in the click handler so popup blockers do not
    // discard the report after the asynchronous workforce and payslip requests.
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setBulkPayslipError("Your browser blocked the combined salary-slip window. Allow pop-ups for this site and try again.");
      return;
    }

    bulkPayslipPrintWindowRef.current = printWindow;
    printWindow.document.open();
    printWindow.document.write("<!doctype html><html><head><title>Preparing workforce salary slips</title></head><body style='font-family:Arial,sans-serif;padding:32px;color:#24354a'><h2>Preparing workforce salary slips…</h2><p>Checking the authorized workforce and loading each monthly statement.</p></body></html>");
    printWindow.document.close();

    setBulkPayslipLoading(true);
    setBulkPayslipError("");
    setError("");
    setNotice("");
    setBulkPayslipProgress({ phase: "scope", completed: 0, total: 1 });

    const query = new URLSearchParams({ startMonth: bulkStartMonth, endMonth: bulkEndMonth });
    const loadRoster = async (): Promise<BulkPayslipEmployee[]> => {
      const response = await fetch("/api/backend/payroll/payslips?" + query.toString(), {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as {
        message?: string;
        employees?: BulkPayslipEmployee[];
        startMonth?: string;
        endMonth?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload && typeof payload.message === "string"
          ? payload.message
          : "Unable to load the authorized workforce for this report.");
      }
      if (!payload || payload.startMonth !== bulkStartMonth || payload.endMonth !== bulkEndMonth || !Array.isArray(payload.employees)) {
        throw new Error("The authorized workforce response was incomplete. Please retry the report.");
      }

      const seen = new Set<string>();
      const employees = payload.employees.map((employee) => {
        if (
          !employee ||
          typeof employee.employeeId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(employee.employeeId) ||
          typeof employee.firstName !== "string" ||
          typeof employee.lastName !== "string"
        ) {
          throw new Error("The workforce list contained an invalid employee record. No combined report was printed.");
        }
        if (seen.has(employee.employeeId)) {
          throw new Error("The workforce list contained a duplicate employee. No combined report was printed.");
        }
        seen.add(employee.employeeId);
        return employee;
      });
      return employees.sort((a, b) => {
        const nameA = ([a.firstName, a.lastName].filter(Boolean).join(" ") || a.employeeCode || "Employee").trim();
        const nameB = ([b.firstName, b.lastName].filter(Boolean).join(" ") || b.employeeCode || "Employee").trim();
        return nameA.localeCompare(nameB, "en", { sensitivity: "base", numeric: true }) ||
          String(a.employeeCode || "").localeCompare(String(b.employeeCode || ""), "en", { sensitivity: "base", numeric: true }) ||
          a.employeeId.localeCompare(b.employeeId);
      });
    };

    try {
      const employees = await loadRoster();
      if (employees.length === 0) {
        throw new Error("There are no eligible workforce members with active employment or payroll activity in the selected period.");
      }

      const statementCount = employees.length * monthCount;
      if (statementCount > MAX_BULK_SLIP_STATEMENTS) {
        throw new Error(
          "This range would create " + statementCount.toLocaleString() +
          " employee-month statements. The combined report limit is " +
          MAX_BULK_SLIP_STATEMENTS.toLocaleString() +
          ". Choose a shorter month range to keep the print job reliable.",
        );
      }

      const expectedMonths = Array.from({ length: monthCount }, (_, index) =>
        payrollMonthFromOrdinal(startOrdinal + index)
      );
      const slipsByEmployee = new Map<string, SalarySlipPayload>();
      const concurrency = 3;
      setBulkPayslipProgress({ phase: "slips", completed: 0, total: employees.length });

      for (let offset = 0; offset < employees.length; offset += concurrency) {
        const batch = employees.slice(offset, offset + concurrency);
        const batchResults = await Promise.all(batch.map(async (employee) => {
          const employeeQuery = new URLSearchParams({
            startMonth: bulkStartMonth,
            endMonth: bulkEndMonth,
          });
          const response = await fetch(
            "/api/backend/payroll/payslips/" + encodeURIComponent(employee.employeeId) + "?" + employeeQuery.toString(),
            { credentials: "same-origin", cache: "no-store" },
          );
          const payload = await response.json().catch(() => null) as SalarySlipPayload | { message?: string } | null;
          if (!response.ok) {
            const reason = payload && "message" in payload && typeof payload.message === "string"
              ? payload.message
              : "The server rejected this workforce member's salary slip.";
            const name = ([employee.firstName, employee.lastName].filter(Boolean).join(" ") || employee.employeeCode || "Employee");
            throw new Error("Unable to prepare the salary slip for " + name + ": " + reason);
          }
          if (
            !payload ||
            !("months" in payload) ||
            !payload.employee ||
            payload.employee.id !== employee.employeeId ||
            payload.startMonth !== bulkStartMonth ||
            payload.endMonth !== bulkEndMonth ||
            !Array.isArray(payload.months) ||
            payload.months.length !== monthCount ||
            payload.months.some((item, index) => item.month !== expectedMonths[index])
          ) {
            const name = ([employee.firstName, employee.lastName].filter(Boolean).join(" ") || employee.employeeCode || "Employee");
            throw new Error("The salary-slip data for " + name + " was incomplete or did not match the selected month range.");
          }
          return payload;
        }));

        for (const payload of batchResults) {
          slipsByEmployee.set(payload.employee.id, payload);
        }
        setBulkPayslipProgress({
          phase: "slips",
          completed: Math.min(employees.length, offset + batch.length),
          total: employees.length,
        });
      }

      setBulkPayslipProgress({ phase: "verify", completed: 0, total: 1 });
      const latestEmployees = await loadRoster();
      const initialIds = employees.map((employee) => employee.employeeId).sort();
      const latestIds = latestEmployees.map((employee) => employee.employeeId).sort();
      if (initialIds.length !== latestIds.length || initialIds.some((id, index) => id !== latestIds[index])) {
        throw new Error("The authorized workforce changed while the report was being prepared. No combined report was printed; reload and try again.");
      }

      const orderedSlips = employees.map((employee) => slipsByEmployee.get(employee.employeeId));
      if (orderedSlips.some((payload) => !payload)) {
        throw new Error("One or more salary slips were missing. No partial combined report was printed.");
      }
      const completedSlips = orderedSlips as SalarySlipPayload[];
      const paidMonths = completedSlips.reduce(
        (sum, payload) => sum + payload.months.filter((item) => item.payment.status === "PAID").length,
        0,
      );
      const unpaidMonths = statementCount - paidMonths;

      if (printWindow.closed) {
        throw new Error("The print window was closed before the combined salary slips were ready. Reopen the report and try again.");
      }
      printWindow.document.open();
      printWindow.document.write(buildSalarySlipDocument(completedSlips));
      printWindow.document.close();

      const printWhenReady = () => {
        if (printWindow.closed) return;
        printWindow.focus();
        printWindow.document.getElementById("salary-slip-print")?.addEventListener("click", () => {
          if (!printWindow.closed) {
            printWindow.focus();
            printWindow.print();
          }
        }, { once: true });
        printWindow.print();
      };
      if (printWindow.document.readyState === "complete") {
        window.setTimeout(printWhenReady, 250);
      } else {
        printWindow.addEventListener("load", () => window.setTimeout(printWhenReady, 250), { once: true });
      }

      setBulkPayslipProgress(null);
      setBulkPayslipOpen(false);
      setNotice(
        "Combined salary slips prepared for " + employees.length +
        " workforce members across " + monthCount + " month(s): " +
        paidMonths + " PAID and " + unpaidMonths +
        " UNPAID employee-month statements. Payment records were not changed.",
      );
      bulkPayslipPrintWindowRef.current = null;
    } catch (caught) {
      if (!printWindow.closed) printWindow.close();
      bulkPayslipPrintWindowRef.current = null;
      setBulkPayslipError(caught instanceof Error ? caught.message : "Unable to prepare the combined salary-slip report.");
      setBulkPayslipProgress(null);
    } finally {
      setBulkPayslipLoading(false);
    }
  }


  async function save(employeeId: string, confirmed = false) {
    const draft = drafts[employeeId]; if (!draft) return;
    const currentPayment = payments.find((payment) => payment.employeeId === employeeId);
    const currentStatus = currentPayment?.status === "PAID" ? "PAID" : "UNPAID";
    if (draft.status !== currentStatus && (draft.status === "PAID" || currentStatus === "PAID") && !confirmed) {
      setPaymentConfirmation(currentPayment || null);
      return;
    }
    if (confirmed) setPaymentConfirmation(null);
    setSaving(employeeId); setError(""); setNotice("");
    try {
      const response = await fetch("/api/backend/payroll/payments", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId, month, ...draft }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Request failed (${response.status})`);
      setNotice("Salary payment record saved."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save salary payment."); }
    finally { setSaving(""); }
  }

  function discardPaymentEdits() {
    setDrafts(Object.fromEntries(payments.map((payment) => [payment.employeeId, {
      amount: payment.amount == null ? "" : String(payment.amount),
      currencyCode: payment.currencyCode || "RWF",
      status: payment.status === "PAID" ? "PAID" : "UNPAID",
      paymentReference: payment.paymentReference || "",
      notes: payment.notes || "",
    }])));
    setError("");
    setNotice("Unsaved payroll edits were discarded.");
  }

  return <section className={`hr-manager-payroll-workspace min-w-0 space-y-5 rounded-2xl border border-white/[0.08] bg-[#141c28] p-4 shadow-lg shadow-black/10 sm:p-6 ${audience === "organization-admin" ? "oa-org-admin-time-pay" : ""}`}>
    <header className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sky-300">
          <BadgeDollarSign size={18}/>
          <span className="text-[11px] font-bold uppercase tracking-[0.16em]">Payroll</span>
          {!canEdit && <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/40 bg-slate-700/30 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-300"><LockKeyhole size={11}/>Read only</span>}
        </div>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">Salary payments</h2>
        <p className="mt-1 text-xs text-slate-500">Review payment status, outstanding earnings and payroll records for the selected month.</p>
      </div>
      <div className="flex min-w-0 flex-wrap items-end gap-2.5 xl:justify-end">
        <label className="min-w-[175px] text-xs font-semibold text-slate-400">
          Register month
          <input
            type="month"
            value={month}
            disabled={!monthReady || Boolean(saving) || bulkPayslipLoading || Boolean(payslipLoading) || Boolean(payslipDialog) || hasUnsavedChanges}
            onChange={(event) => {
              const nextMonth = event.target.value;
              if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(nextMonth) || nextMonth === month) return;
              setLoading(true);
              setError("");
              setNotice("");
              setMonth(nextMonth);
            }}
            title={hasUnsavedChanges ? "Save your payment edits before changing the payroll month." : "Choose the payroll month to review."}
            className={INPUT}
          />
          {hasUnsavedChanges && (
            <span className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-medium text-amber-200">
              Unsaved payment edits
              <button
                type="button"
                onClick={discardPaymentEdits}
                disabled={Boolean(saving)}
                className="rounded-md border border-amber-300/20 px-2 py-1 text-[10px] font-bold text-amber-100 transition hover:bg-amber-300/10 disabled:opacity-40"
              >
                Discard edits
              </button>
            </span>
          )}
        </label>
        {canEdit && (hasUnsavedChanges
          ? <span aria-disabled="true" title="Save or discard payment edits before opening pay rates." className="inline-flex min-h-10 cursor-not-allowed items-center justify-center rounded-xl border border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-500">Manage pay rates</span>
          : <Link href={audience === "hr-manager" ? "/hr/modules/pay-rates" : "/org/pay-rates"} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-600 bg-white/[0.025] px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]">Manage pay rates</Link>)}
        {canEdit && <button type="button" onClick={() => {
          if (!bulkPayslipOpen) {
            const currentMonth = month || monthNow();
            setBulkStartMonth(currentMonth);
            setBulkEndMonth(currentMonth);
            setBulkPayslipError("");
          }
          setBulkPayslipOpen(!bulkPayslipOpen);
        }} disabled={!monthReady || loading || hasUnsavedChanges || bulkPayslipLoading || Boolean(payslipLoading) || Boolean(payslipDialog)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-300/[0.07] px-3.5 py-2 text-xs font-bold text-cyan-100 transition hover:bg-cyan-300/[0.12] disabled:cursor-not-allowed disabled:opacity-40">
          <Printer size={14}/>{bulkPayslipOpen ? "Close multi-month slips" : "Generate multi-month pay slips"}
        </button>}
        <button type="button" onClick={exportPayrollRegister} disabled={loading || bulkPayslipLoading || hasUnsavedChanges || payments.length === 0 || visiblePayments.length === 0} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40">
          <FileDown size={14}/>Export register PDF
        </button>
      </div>
    </header>

    {canEdit && bulkPayslipOpen && (
      <section aria-label="Generate combined workforce salary slips" className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-[#123044] via-[#102234] to-[#101a29] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200/80">Combined workforce report</p>
            <h3 className="mt-1 text-base font-bold text-white">Multi-month salary slips</h3>
            <p className="mt-1 text-xs leading-5 text-slate-300">One monthly salary statement for every eligible workforce member. Members are sorted A–Z, and each statement shows the latest payment status from the payroll ledger.</p>
          </div>
          <span className="rounded-full border border-cyan-300/20 bg-black/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-cyan-100">
            {audience === "organization-admin" ? "Organization-wide" : "HR reporting scope"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-300">
            From month
            <input
              type="month"
              value={bulkStartMonth}
              min="2000-01"
              max={bulkEndMonth || month || undefined}
              disabled={bulkPayslipLoading}
              onChange={(event) => { setBulkStartMonth(event.target.value); setBulkPayslipError(""); }}
              className={INPUT}
            />
          </label>
          <label className="block text-xs font-semibold text-slate-300">
            To month
            <input
              type="month"
              value={bulkEndMonth}
              min={bulkStartMonth || "2000-01"}
              max={month || undefined}
              disabled={bulkPayslipLoading}
              onChange={(event) => { setBulkEndMonth(event.target.value); setBulkPayslipError(""); }}
              className={INPUT}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">Quick range</span>
          <button type="button" onClick={() => applyBulkPayslipPreset(3)} disabled={bulkPayslipLoading || !monthReady} className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/[0.12] disabled:opacity-40">Last 3 months</button>
          <button type="button" onClick={() => applyBulkPayslipPreset(6)} disabled={bulkPayslipLoading || !monthReady} className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/[0.12] disabled:opacity-40">Last 6 months</button>
          <button type="button" onClick={() => applyBulkPayslipPreset(12)} disabled={bulkPayslipLoading || !monthReady} className="rounded-lg border border-white/[0.10] bg-white/[0.035] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07] disabled:opacity-40">Last 12 months</button>
          <button type="button" onClick={() => applyBulkPayslipPreset(1)} disabled={bulkPayslipLoading || !monthReady} className="rounded-lg border border-white/[0.10] bg-white/[0.035] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07] disabled:opacity-40">This month</button>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.09] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-xs leading-5 text-slate-300">
            {!isPayrollMonth(bulkStartMonth) || !isPayrollMonth(bulkEndMonth)
              ? "Choose a valid month range."
              : payrollMonthOrdinal(bulkStartMonth) > payrollMonthOrdinal(bulkEndMonth)
                ? <span className="text-amber-200">The From month must not be later than the To month.</span>
                : payrollMonthOrdinal(bulkEndMonth) - payrollMonthOrdinal(bulkStartMonth) + 1 > 24
                  ? <span className="text-amber-200">Choose a range of 24 months or fewer.</span>
                  : <span>{payrollMonthOrdinal(bulkEndMonth) - payrollMonthOrdinal(bulkStartMonth) + 1} month(s) · A maximum of 3,000 employee-month statements per combined report.</span>}
            <span className="mt-1 block text-[11px] text-slate-400">Only your authorized workforce is included. This report does not create, edit or mark any salary payment as paid.</span>
          </div>
          <button
            type="button"
            onClick={() => void generateBulkSalarySlips()}
            disabled={bulkPayslipLoading || loading || !monthReady || hasUnsavedChanges || !isPayrollMonth(bulkStartMonth) || !isPayrollMonth(bulkEndMonth) || payrollMonthOrdinal(bulkStartMonth) > payrollMonthOrdinal(bulkEndMonth) || payrollMonthOrdinal(bulkEndMonth) - payrollMonthOrdinal(bulkStartMonth) + 1 > 24 || (isPayrollMonth(month) && payrollMonthOrdinal(bulkEndMonth) > payrollMonthOrdinal(month))}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {bulkPayslipLoading ? <RefreshCw size={14} className="animate-spin"/> : <FileDown size={14}/>}
            {bulkPayslipLoading ? "Preparing combined PDF…" : "Generate combined PDF"}
          </button>
        </div>

        {bulkPayslipLoading && bulkPayslipProgress && (
          <div role="status" className="mt-3 rounded-xl border border-cyan-300/15 bg-black/15 p-3 text-xs text-cyan-100">
            {bulkPayslipProgress.phase === "scope"
              ? "Checking the authorized workforce…"
              : bulkPayslipProgress.phase === "verify"
                ? "Verifying that the reporting scope has not changed…"
                : "Preparing salary slips: " + bulkPayslipProgress.completed + " of " + bulkPayslipProgress.total + " workforce members"}
            {bulkPayslipProgress.phase === "slips" && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: Math.round((bulkPayslipProgress.completed / Math.max(1, bulkPayslipProgress.total)) * 100) + "%" }}/>
              </div>
            )}
          </div>
        )}
        {bulkPayslipError && <p role="alert" className="mt-3 rounded-xl border border-rose-300/20 bg-rose-300/[0.06] p-3 text-sm leading-5 text-rose-100">{bulkPayslipError}</p>}
      </section>
    )}

    {dateWarning && <div role="status" className="rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-3 text-sm text-amber-100">{dateWarning}</div>}
    {error && <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><button type="button" disabled={loading || Boolean(saving) || hasUnsavedChanges} onClick={() => void load()} className="min-h-9 shrink-0 rounded-lg border border-rose-300/20 px-3 py-1.5 text-xs font-bold text-rose-100 hover:bg-rose-300/10 disabled:opacity-50">{loading ? "Retrying…" : hasUnsavedChanges ? "Discard edits to retry" : "Retry"}</button></div>}
    {notice && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-sm text-emerald-200">{notice}</p>}

    <section aria-label="Payroll status summary" className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-xl border border-white/[0.08] bg-[#101722] p-4">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-400"><span>Workforce in scope</span><Users size={15} className="text-slate-500"/></div>
        <p className="mt-3 text-2xl font-bold tabular-nums text-white">{loading ? "—" : payments.length}</p>
        <p className="mt-1 text-[11px] text-slate-500">For {month || "selected period"}</p>
      </div>
      <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.035] p-4">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold text-emerald-200"><span>Paid</span><CheckCircle2 size={15}/></div>
        <p className="mt-3 text-2xl font-bold tabular-nums text-white">{loading ? "—" : paidCount}</p>
        <p className="mt-1 text-[11px] text-slate-500">Payment records completed</p>
      </div>
      <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.035] p-4">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold text-amber-200"><span>Outstanding</span><CircleDollarSign size={15}/></div>
        <p className="mt-3 text-2xl font-bold tabular-nums text-white">{loading ? "—" : unpaidCount}</p>
        <p className="mt-1 text-[11px] text-slate-500">Awaiting payment</p>
      </div>
      <div className="rounded-xl border border-rose-400/15 bg-rose-400/[0.035] p-4">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold text-rose-200"><span>Payroll exceptions</span><AlertTriangle size={15}/></div>
        <p className="mt-3 text-2xl font-bold tabular-nums text-white">{loading ? "—" : needsReviewCount + noHoursCount}</p>
        <p className="mt-1 text-[11px] text-slate-500">{needsReviewCount} rate / currency · {noHoursCount} no hours</p>
      </div>
    </section>

    <section className="rounded-2xl border border-white/[0.07] bg-[#101722]/85 p-4 sm:p-5" aria-label="Payroll financial summary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-100">Payroll financial summary</h3>
        <span className="text-[11px] text-slate-500">Amounts grouped by currency</span>
      </div>
      {loading ? <div className="mt-4 h-16 animate-pulse rounded-xl bg-white/[0.035]"/> : currencySummaries.length === 0 ? <p className="mt-3 text-sm text-slate-500">No calculated or recorded payroll amounts for this period.</p> : <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {currencySummaries.map((summary) => (
          <div key={summary.currencyCode} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-sky-300">{summary.currencyCode}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div><p className="text-[10px] text-slate-500">Total</p><p className="mt-1 break-words text-sm font-bold tabular-nums text-white">{money(summary.total, summary.currencyCode)}</p></div>
              <div><p className="text-[10px] text-slate-500">Paid</p><p className="mt-1 break-words text-sm font-bold tabular-nums text-emerald-200">{money(summary.paid, summary.currencyCode)}</p><p className="mt-1 text-[10px] text-slate-500">{summary.paidCount} people</p></div>
              <div><p className="text-[10px] text-slate-500">Outstanding</p><p className="mt-1 break-words text-sm font-bold tabular-nums text-amber-200">{money(summary.outstanding, summary.currencyCode)}</p><p className="mt-1 text-[10px] text-slate-500">{summary.unpaidCount} people</p></div>
            </div>
          </div>
        ))}
      </div>}
    </section>

    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101722]/80" aria-label="Payroll register">
      <div className="border-b border-white/[0.07] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-base font-semibold text-white">Payroll register</h3><p className="mt-1 text-xs text-slate-500">{month} · {payments.length} records</p></div>
          <div className="flex items-center gap-2">
            {!canEdit && <span className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300"><LockKeyhole size={12}/>Read only</span>}
            {canEdit && <span className="inline-flex items-center gap-1 rounded-lg border border-sky-400/20 bg-sky-400/[0.05] px-2.5 py-1.5 text-[11px] font-semibold text-sky-200"><Pencil size={12}/>Payment management</span>}
          </div>
        </div>
        <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-[minmax(220px,1.4fr)_minmax(150px,.8fr)_minmax(145px,.7fr)_minmax(155px,.7fr)]">
          <label className="block min-w-0 text-xs font-semibold text-slate-400">
            <span className="flex items-center gap-2"><Search size={13} className="text-slate-500"/>Search workforce</span>
            <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Name, ID, department, reference…" className={INPUT}/>
          </label>
          <label className="block min-w-0 text-xs font-semibold text-slate-400">Department
            <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} className={INPUT}>
              <option value="ALL">All departments</option>
              {departments.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </label>
          <label className="block min-w-0 text-xs font-semibold text-slate-400">Sort by
            <select value={sortOption} onChange={(event) => setSortOption(event.target.value as typeof sortOption)} className={INPUT}>
              <option value="NAME_ASC">Name · A–Z</option>
              <option value="NAME_DESC">Name · Z–A</option>
              <option value="AMOUNT_DESC">Amount · High–low by currency</option>
              <option value="AMOUNT_ASC">Amount · Low–high by currency</option>
              <option value="STATUS">Payment priority</option>
            </select>
          </label>
          <label className="block min-w-0 text-xs font-semibold text-slate-400">Rows per page
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className={INPUT}>
              <option value={25}>25 rows</option><option value={50}>50 rows</option><option value={100}>100 rows</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Filter payments by status">
          {([
            ["ALL", "All", payments.length],
            ["UNPAID", "Unpaid", unpaidCount],
            ["PAID", "Paid", paidCount],
            ["REVIEW", "Needs review", needsReviewCount],
            ["NO_HOURS", "No hours", noHoursCount],
          ] as const).map(([value, label, count]) => (
            <button key={value} type="button" onClick={() => setPaymentFilter(value)} aria-pressed={paymentFilter === value}
              className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${paymentFilter === value ? "border-sky-400/35 bg-sky-400/10 text-sky-200" : "border-slate-700 bg-white/[0.02] text-slate-400 hover:text-slate-200"}`}>
              {label}<span className="rounded-md bg-black/20 px-1.5 py-0.5 tabular-nums">{loading ? "—" : count}</span>
            </button>
          ))}
          {(departmentFilter !== "ALL" || paymentFilter !== "ALL" || searchQuery) && <button type="button" onClick={() => {setDepartmentFilter("ALL");setPaymentFilter("ALL");setSearchQuery("");}} className="ml-auto inline-flex min-h-9 items-center gap-1.5 px-2 text-xs font-semibold text-sky-300 hover:text-sky-200">Clear filters <ChevronDown size={13}/></button>}
        </div>
      </div>

      {loading ? <div className="space-y-2 p-4"><div className="h-12 animate-pulse rounded-lg bg-white/[0.035]"/><div className="h-12 animate-pulse rounded-lg bg-white/[0.035]"/><div className="h-12 animate-pulse rounded-lg bg-white/[0.035]"/></div>
      : payments.length === 0 ? <div className="p-10 text-center"><CircleDollarSign size={25} className="mx-auto text-slate-500"/><p className="mt-3 font-semibold text-slate-200">No payroll records for this period</p></div>
      : visiblePayments.length === 0 ? <div className="p-10 text-center"><Search size={22} className="mx-auto text-slate-500"/><p className="mt-3 font-semibold text-slate-200">No matching payroll records</p><p className="mt-1 text-xs text-slate-500">Change or clear the current filters.</p><button type="button" onClick={() => {setDepartmentFilter("ALL");setPaymentFilter("ALL");setSearchQuery("");}} className="mt-3 text-sm font-semibold text-sky-300">Clear filters</button></div>
      : <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left">
          <thead className="bg-white/[0.025] text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Workforce member</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3 text-right">Payroll amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Payment details</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagePayments.map((payment) => {
              const name = [payment.firstName, payment.lastName].filter(Boolean).join(" ") || payment.employeeCode || "Employee";
              const isReview = payment.status === "RATE_REQUIRED" || payment.status === "CURRENCY_MISMATCH";
              const statusLabel = payment.status === "PAID" ? "Paid" : payment.status === "NO_RECORDED_HOURS" ? "No recorded hours" : payment.status === "RATE_REQUIRED" ? "Rate required" : payment.status === "CURRENCY_MISMATCH" ? "Currency mismatch" : "Unpaid";
              const statusStyle = payment.status === "PAID" ? "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200" : payment.status === "NO_RECORDED_HOURS" ? "border-slate-600 bg-slate-700/30 text-slate-300" : isReview ? "border-rose-400/25 bg-rose-400/[0.08] text-rose-200" : "border-amber-400/25 bg-amber-400/[0.08] text-amber-200";
              const amount = payment.status === "PAID" ? payment.amount : payment.calculatedAmount ?? payment.amount;
              const draft = drafts[payment.employeeId] || { amount: payment.amount == null ? "" : String(payment.amount), currencyCode: payment.currencyCode || "RWF", status: payment.status === "PAID" ? "PAID" : "UNPAID", paymentReference: payment.paymentReference || "", notes: payment.notes || "" };
              const isExpanded = expandedEmployeeId === payment.employeeId;
              return <Fragment key={payment.employeeId}>
                <tr className="border-t border-white/[0.055] align-middle transition hover:bg-white/[0.02]">
                  <td className="px-4 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <EmployeeProfilePhoto employeeId={payment.employeeId} name={name} className="size-9 shrink-0 rounded-lg border border-sky-400/15 bg-sky-400/[0.07]" textClassName="text-xs font-bold text-sky-200"/>
                      <div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-100">{name}</p><p className="mt-1 break-words text-[11px] text-slate-500">{payment.employeeCode || "—"} · {payment.departmentName || "Unassigned"}{payment.workforceRole ? ` · ${payment.workforceRole.replaceAll("_", " ")}` : ""}</p></div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-slate-200">{Math.floor(Math.max(0, payment.workedMinutes || 0) / 60)}h {String(Math.max(0, payment.workedMinutes || 0) % 60).padStart(2, "0")}m</p>
                    <p className="mt-1 whitespace-nowrap text-[11px] text-slate-500">Payable {Math.floor(Math.max(0, payment.payableMinutes || 0) / 60)}h {String(Math.max(0, payment.payableMinutes || 0) % 60).padStart(2, "0")}m</p>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <p className="whitespace-nowrap text-sm font-bold tabular-nums text-white">{money(amount, payment.currencyCode)}</p>
                    <p className="mt-1 text-[10px] text-slate-500">{payment.status === "PAID" ? "Paid amount" : payment.status === "UNPAID" ? "Calculated due" : "Not payable"}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusStyle}`}>
                      {payment.status === "PAID" ? <CheckCircle size={12}/> : isReview ? <AlertTriangle size={12}/> : payment.status === "NO_RECORDED_HOURS" ? <Clock3 size={12}/> : <CircleDollarSign size={12}/>}
                      {statusLabel}
                    </span>
                    <p className="mt-1 text-[10px] text-slate-500">{payment.status === "RATE_REQUIRED" ? "Missing rate for payable work dates" : payment.paymentRecorded ? "Payment record stored" : "No payment record"}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="whitespace-nowrap text-xs text-slate-300">{formatPayrollTimestamp(payment.paidAt, organizationTimeZone, false)}</p>
                    <p className="mt-1 max-w-[180px] truncate text-[10px] text-slate-500" title={payment.paymentReference || ""}>{payment.paymentReference || "No reference"}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setExpandedEmployeeId(isExpanded ? "" : payment.employeeId)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-white/[0.05]">
                        {isExpanded ? <ChevronDown size={13}/> : canEdit ? <Pencil size={13}/> : <Eye size={13}/>}
                        {isExpanded ? "Close" : canEdit ? "Manage" : "View"}
                      </button>
                      {canEdit && <button type="button" onClick={() => void printSalarySlip(payment.employeeId)} disabled={Boolean(payslipLoading) || Boolean(payslipDialog) || hasUnsavedChanges || !month} title={hasUnsavedChanges ? "Save or discard payment edits before preparing a salary slip." : "Prepare this workforce member’s salary slip."} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-sky-300/20 bg-sky-300/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-sky-200 transition hover:bg-sky-300/[0.12] disabled:opacity-40">
                        {payslipLoading === payment.employeeId ? <RefreshCw size={13} className="animate-spin"/> : <Printer size={13}/>}Slip
                      </button>}
                    </div>
                  </td>
                </tr>
                {isExpanded && <tr className="border-t border-sky-400/10 bg-[#0c1420]/80"><td colSpan={6} className="p-4 sm:p-5">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]">
                    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">Payroll calculation</p>
                      <p className="mt-2 break-words text-2xl font-bold tracking-tight text-white">{money(payment.calculatedAmount == null ? null : String(payment.calculatedAmount), payment.currencyCode)}</p>
                      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-3 sm:grid-cols-3">
                        <div><p className="text-[10px] text-slate-500">Currency</p><p className="mt-1 text-sm font-semibold text-slate-200">{payment.currencyCode}</p></div>
                        <div><p className="text-[10px] text-slate-500">Payable time</p><p className="mt-1 text-sm font-semibold text-slate-200">{Math.floor(Math.max(0,payment.payableMinutes||0)/60)}h {String(Math.max(0,payment.payableMinutes||0)%60).padStart(2,"0")}m</p></div>
                        <div><p className="text-[10px] text-slate-500">Regular earnings</p><p className="mt-1 text-sm font-semibold text-slate-200">{money(payment.calculatedRegularAmount ?? null, payment.currencyCode)}</p></div>
                        <div><p className="text-[10px] text-slate-500">Overtime earnings</p><p className="mt-1 text-sm font-semibold text-slate-200">{money(payment.calculatedOvertimeAmount ?? null, payment.currencyCode)}</p></div>
                        <div><p className="text-[10px] text-slate-500">Paid-absence earnings</p><p className="mt-1 text-sm font-semibold text-slate-200">{money(payment.calculatedPaidAbsenceAmount ?? null, payment.currencyCode)}</p></div>
                        <div><p className="text-[10px] text-slate-500">Paid leave / holiday</p><p className="mt-1 text-sm font-semibold text-slate-200">{Math.floor(Math.max(0,(payment.paidLeaveMinutes||0)+(payment.paidHolidayMinutes||0))/60)}h {String(Math.max(0,(payment.paidLeaveMinutes||0)+(payment.paidHolidayMinutes||0))%60).padStart(2,"0")}m</p></div>
                      </div>
                    </div>
                    {canEdit ? <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold text-white">Payment record</h4><span className="text-[10px] text-slate-500">{payment.paymentRecorded ? `Last updated ${formatPayrollTimestamp(payment.updatedAt, organizationTimeZone)}` : "Not yet recorded"}</span></div>
                      <div className="mt-2 text-[11px] text-slate-500">Recorded by {payment.recordedBy || "—"}{payment.paidAt ? ` · Paid ${formatPayrollTimestamp(payment.paidAt, organizationTimeZone)}` : ""}</div>
                      <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                        <label className="block text-xs font-medium text-slate-400">Payment status<select value={draft.status} onChange={(event) => setDrafts((old) => ({...old,[payment.employeeId]:{...draft,status:event.target.value as "PAID"|"UNPAID"}}))} className={INPUT}><option value="UNPAID">Unpaid</option><option value="PAID">Paid</option></select></label>
                        <label className="block text-xs font-medium text-slate-400">Payment reference<input maxLength={120} value={draft.paymentReference} onChange={(event) => setDrafts((old) => ({...old,[payment.employeeId]:{...draft,paymentReference:event.target.value}}))} className={INPUT} placeholder="Bank / transfer reference"/></label>
                        <label className="block text-xs font-medium text-slate-400 sm:col-span-2">Notes<input maxLength={1000} value={draft.notes} onChange={(event) => setDrafts((old) => ({...old,[payment.employeeId]:{...draft,notes:event.target.value}}))} className={INPUT} placeholder="Payment note"/></label>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                        <p className="max-w-2xl text-[11px] leading-5 text-slate-500">{(payment.payableMinutes || 0) <= 0 ? "No payable hours are available for this month." : payment.status === "CURRENCY_MISMATCH" ? "Resolve the currency mismatch in pay-rate history first." : payment.calculatedAmount == null ? "A valid effective pay rate is required before payment can be recorded." : "The payable amount is calculated from attendance, approved overtime, paid absences and effective pay rates."}</p>
                        <button type="button" className={BUTTON} disabled={Boolean(saving) || (payment.payableMinutes || 0) <= 0 || payment.calculatedAmount == null} onClick={() => void save(payment.employeeId)}>{saving === payment.employeeId ? <RefreshCw size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>}Save payment</button>
                      </div>
                    </div> : <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                      <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold text-white">Payment record</h4><span className="inline-flex items-center gap-1 rounded-full border border-slate-600 px-2 py-1 text-[10px] font-semibold text-slate-400"><LockKeyhole size={10}/>Read only</span></div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div><p className="text-[10px] text-slate-500">Paid at</p><p className="mt-1 text-sm text-slate-200">{payment.paidAt ? formatPayrollTimestamp(payment.paidAt, organizationTimeZone) : "Not paid"}</p></div>
                        <div><p className="text-[10px] text-slate-500">Payment reference</p><p className="mt-1 break-all text-sm text-slate-200">{payment.paymentReference || "—"}</p></div>
                        <div><p className="text-[10px] text-slate-500">Recorded by</p><p className="mt-1 text-sm text-slate-200">{payment.recordedBy || "—"}</p></div>
                        <div><p className="text-[10px] text-slate-500">Last updated</p><p className="mt-1 text-sm text-slate-200">{formatPayrollTimestamp(payment.updatedAt, organizationTimeZone)}</p></div>
                        {payment.notes && <div className="sm:col-span-2"><p className="text-[10px] text-slate-500">Notes</p><p className="mt-1 break-words text-sm text-slate-300">{payment.notes}</p></div>}
                      </div>
                    </div>}
                  </div>
                </td></tr>}
              </Fragment>;
            })}
          </tbody>
        </table>
      </div>}
      {!loading && visiblePayments.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] px-4 py-3 text-xs text-slate-500">
        <span>Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, visiblePayments.length)} of {visiblePayments.length}</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1,current-1))} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-700 px-3 text-slate-300 disabled:opacity-35"><ChevronLeft size={13}/>Previous</button>
          <span className="min-w-[75px] text-center tabular-nums text-slate-300">Page {safePage} / {pageCount}</span>
          <button type="button" disabled={safePage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount,current+1))} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-700 px-3 text-slate-300 disabled:opacity-35">Next<ChevronRight size={13}/></button>
        </div>
      </div>}
    </section>
    {payslipDialog && typeof document !== "undefined" && createPortal(
      <div
        className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 sm:p-5"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !generatingPayslip && !payslipLoading) cancelSalarySlipPreparation();
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="salary-slip-title"
          aria-describedby="salary-slip-status-description"
          ref={payslipDialogRef}
          tabIndex={-1}
          className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#111a28] p-4 text-white shadow-[0_28px_80px_rgba(0,0,0,0.5)] sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-sky-300"><FileDown size={15} /> Salary slip · PDF</span>
              <h2 id="salary-slip-title" className="mt-2 text-xl font-bold">Prepare salary slip</h2>
              <p className="mt-1 text-sm text-slate-300">{payslipDialog.employeeName}</p>
            </div>
            <button
              type="button"
              onClick={cancelSalarySlipPreparation}
              disabled={generatingPayslip || Boolean(payslipLoading)}
              aria-label="Close salary slip preparation"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-slate-700 text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <div className="mt-4 grid gap-3 rounded-xl border border-sky-300/15 bg-sky-300/[0.05] p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block text-xs font-semibold text-slate-300">
              From month
              <input
                type="month"
                value={payslipDialog.startMonth}
                disabled={generatingPayslip || Boolean(payslipLoading)}
                onChange={(event) => setPayslipDialog((current) => current ? { ...current, startMonth: event.target.value } : current)}
                className={INPUT}
              />
            </label>
            <label className="block text-xs font-semibold text-slate-300">
              To month
              <input
                type="month"
                value={payslipDialog.endMonth}
                disabled={generatingPayslip || Boolean(payslipLoading)}
                onChange={(event) => setPayslipDialog((current) => current ? { ...current, endMonth: event.target.value } : current)}
                className={INPUT}
              />
            </label>
            <button
              type="button"
              onClick={() => void loadSalarySlipPeriod()}
              disabled={generatingPayslip || Boolean(payslipLoading)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-sky-300/25 px-3 py-2 text-xs font-bold text-sky-100 transition hover:bg-sky-300/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {payslipLoading === payslipDialog.employeeId ? <RefreshCw size={13} className="animate-spin"/> : <Clock3 size={13}/>}
              Reload period
            </button>
            <p className="text-xs leading-5 text-slate-300 sm:col-span-3">
              Choose a start and end month (maximum 24 months). The selected months and their payment states are loaded from the payroll ledger before printing.
            </p>
          </div>
          <p id="salary-slip-status-description" className="mt-3 text-sm leading-6 text-slate-300">
            Each salary slip uses the current status from the payroll ledger. PAID months print as PAID; UNPAID or unrecorded months print as UNPAID. Generating a slip does not save or change any payroll payment record.
          </p>

          <div className="mt-4 space-y-2">
            {payslipDialog.payload.months.map((monthRecord) => {
              const status = monthRecord.payment.status === "PAID" ? "PAID" : "UNPAID";
              const isPaid = status === "PAID";
              const isRecorded = monthRecord.payment.recorded;
              const monthLabel = new Intl.DateTimeFormat("en", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(`${monthRecord.month}-01T00:00:00Z`));
              return (
                <div key={monthRecord.month} className="grid gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,190px)] sm:items-center">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-100">{monthLabel}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {isRecorded
                        ? "Status already stored in payroll"
                        : "No payment record · this salary slip will show UNPAID"}
                    </p>
                    {isPaid && (
                      <p className="mt-1 text-xs text-emerald-200">Already paid · this salary slip will show PAID.</p>
                    )}
                  </div>
                  <div aria-label={`Payment status: ${status}, read only`} className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-400">Payment status · read only</span>
                    <div role="status" className={`mt-1.5 flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 ${isPaid ? "border-emerald-400/20 bg-emerald-400/[0.07]" : "border-amber-400/20 bg-amber-400/[0.06]"}`}>
                      <span className={`text-sm font-bold ${isPaid ? "text-emerald-200" : "text-amber-200"}`}>{status}</span>
                      <span className={`text-[10px] font-semibold uppercase tracking-wide ${isRecorded ? "text-slate-300" : "text-amber-200"}`}>{isRecorded ? "Recorded" : "Not recorded"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {error && (
            <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={cancelSalarySlipPreparation}
              disabled={generatingPayslip || Boolean(payslipLoading)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.05] disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void generateAndPrintSalarySlip()}
              disabled={generatingPayslip || Boolean(payslipLoading) || payslipDialog.startMonth !== payslipDialog.payload.startMonth || payslipDialog.endMonth !== payslipDialog.payload.endMonth}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 disabled:cursor-wait disabled:opacity-50"
            >
              {generatingPayslip ? <RefreshCw size={15} className="animate-spin" /> : <Printer size={15} />}
              {generatingPayslip ? "Generating slip…" : payslipDialog.startMonth !== payslipDialog.payload.startMonth || payslipDialog.endMonth !== payslipDialog.payload.endMonth ? "Load selected period first" : "Generate & print salary slip"}
            </button>
          </div>
        </section>
      </div>,
      document.body,
    )}
    {paymentConfirmation && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setPaymentConfirmation(null); }}>
        <section ref={paymentConfirmationRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="payroll-confirm-title" aria-describedby="payroll-confirm-description" className="w-full max-w-md rounded-2xl border border-amber-300/20 bg-[#111a28] p-5 text-white shadow-2xl sm:p-6">
          <span className="flex size-11 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/10 text-amber-200"><AlertTriangle size={20}/></span>
          <h2 id="payroll-confirm-title" className="mt-4 text-lg font-bold">Confirm payment status change</h2>
          <p id="payroll-confirm-description" className="mt-2 text-sm leading-6 text-slate-300">
            {drafts[paymentConfirmation.employeeId]?.status === "PAID" ? "You are about to mark the calculated salary for " + ([paymentConfirmation.firstName, paymentConfirmation.lastName].filter(Boolean).join(" ") || paymentConfirmation.employeeCode || "this employee") + " as paid for " + month + ". Confirm that the payment has actually been made before recording this status." : "You are about to change the payment record for " + ([paymentConfirmation.firstName, paymentConfirmation.lastName].filter(Boolean).join(" ") || paymentConfirmation.employeeCode || "this employee") + " to unpaid for " + month + ". Confirm that this correction is intentional."}
          </p>
          <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/15 p-4">
            <p className="text-xs text-slate-500">Calculated amount</p>
            <p className="mt-1 text-2xl font-bold text-white">{money(paymentConfirmation.calculatedAmount == null ? null : String(paymentConfirmation.calculatedAmount), paymentConfirmation.currencyCode)}</p>
            <p className="mt-2 text-xs text-slate-400">Employee: {[paymentConfirmation.firstName, paymentConfirmation.lastName].filter(Boolean).join(" ") || paymentConfirmation.employeeCode || "Employee"}</p>
            <p className="mt-1 text-xs text-slate-400">Period: {month}</p>
            {drafts[paymentConfirmation.employeeId]?.paymentReference && <p className="mt-1 break-all text-xs text-slate-400">Reference: {drafts[paymentConfirmation.employeeId].paymentReference}</p>}
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" disabled={Boolean(saving)} onClick={() => setPaymentConfirmation(null)} className="min-h-10 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.05] disabled:opacity-50">Go back</button>
            <button type="button" disabled={Boolean(saving)} onClick={() => void save(paymentConfirmation.employeeId, true)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2 text-sm font-bold text-[#07111d] hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-50">
              {saving ? <RefreshCw size={15} className="animate-spin"/> : <CheckCircle2 size={15}/>}
              {saving ? "Saving…" : drafts[paymentConfirmation.employeeId]?.status === "PAID" ? "Confirm marked as paid" : "Confirm marked as unpaid"}
            </button>
          </div>
        </section>
      </div>
    )}
    {canEdit && <p className="mt-4 text-xs leading-5 text-slate-500">Salary amounts and currency are calculated from recorded working time, approved paid leave, paid public holidays, and effective pay rates. Only the payment status and reference/notes are editable here. Employees with no payable hours cannot be marked paid.</p>}
  </section>;
}

