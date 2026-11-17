"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { BadgeDollarSign, CheckCircle2, RefreshCw, Search, Clock3, AlertTriangle, CheckCircle, CircleDollarSign, Printer, FileDown, Download, ChevronDown, ChevronLeft, ChevronRight, Eye, Pencil, LockKeyhole } from "lucide-react";
import { buildSalarySlipDocument, type SalarySlipPayload } from "./salary-slip-document";
import EmployeeProfilePhoto from "../employee/EmployeeProfilePhoto";
import { useWorkspaceAutoRefresh } from "../shared/useWorkspaceAutoRefresh";

type Payment = { id?: string | null; employeeId: string; employeeCode?: string | null; firstName?: string | null; lastName?: string | null; departmentName?: string | null; workforceRole?: string | null; payMonth: string; amount: string | number | null; calculatedAmount?: string | number | null; workedMinutes?: number; payableMinutes?: number; paidLeaveMinutes?: number; paidHolidayMinutes?: number; currencyCode: string; status: "PAID" | "UNPAID" | "NO_RECORDED_HOURS" | "RATE_REQUIRED" | "CURRENCY_MISMATCH"; currencyMismatch?: boolean; paidAt?: string | null; paymentReference?: string | null; notes?: string | null; paymentRecorded?: boolean; recordedByUserId?: string | null; recordedBy?: string | null; createdAt?: string | null; updatedAt?: string | null };
type EmployeeRoleRecord = { id?: string; workforce_role?: unknown; workforceRole?: unknown; roleName?: unknown; role_name?: unknown; role?: unknown; userRole?: unknown; user_role?: unknown; user?: { role?: unknown } };
type Props = { audience: "hr-manager" | "organization-admin" | "department-manager" | "employee"; employeeId?: string; excludeEmployeeId?: string };
type PayslipPaymentStatus = "PAID" | "UNPAID";
type PayslipDialogState = {
  employeeId: string;
  employeeName: string;
  payload: SalarySlipPayload;
  statuses: Record<string, PayslipPaymentStatus>;
};
const INPUT = "mt-1.5 w-full rounded-xl border border-slate-700 bg-[#0b111b] px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-400";
const BUTTON = "inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold !text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 [&>svg]:!text-white";
function localDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function monthNow() { return localDate().slice(0, 7); }
function money(value: string | number | null, currency: string) { if (value === null || value === "") return "Not recorded"; const n = Number(value); if (!Number.isFinite(n)) return "—"; try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n); } catch { return `${currency} ${n.toFixed(2)}`; } }
function normalizedEmployeeRoles(employee: EmployeeRoleRecord): string[] {
  const normalize = (value: unknown): string[] => {
    if (typeof value === "string") return [value.toUpperCase().trim().replace(/[^A-Z0-9]+/g, "_")];
    if (value && typeof value === "object") {
      const role = value as { name?: unknown; title?: unknown; slug?: unknown };
      return [role.name, role.title, role.slug].filter((item): item is string => typeof item === "string").map((item) => item.toUpperCase().trim().replace(/[^A-Z0-9]+/g, "_"));
    }
    return [];
  };
  return [
    ...normalize(employee.workforce_role), ...normalize(employee.workforceRole),
    ...normalize(employee.roleName), ...normalize(employee.role_name),
    ...normalize(employee.role), ...normalize(employee.userRole),
    ...normalize(employee.user_role), ...normalize(employee.user?.role),
  ];
}

function isExcludedHrTarget(employee: EmployeeRoleRecord, allowHrManager = false) {
  const roles = normalizedEmployeeRoles(employee);
  const isOrganizationAdmin = roles.some((role) => ["ORGANIZATION_ADMIN", "ORG_ADMIN", "ORGANIZATIONADMIN", "ORGANIZATION_ADMINISTRATOR", "ORGANIZATION_OWNER", "ORG_OWNER", "TENANT_ADMIN", "ADMINISTRATOR"].includes(role) || role.startsWith("ORGANIZATION_ADMIN_") || role.startsWith("ORGANIZATIONADMIN_") || role.startsWith("ORG_ADMIN_") || role.startsWith("ORGANIZATION_OWNER_") || role.startsWith("ORG_OWNER_") || role.startsWith("TENANT_ADMIN_"));
  const isHrManager = roles.some((role) => ["HR_MANAGER", "HRMANAGER"].includes(role) || role.startsWith("HR_MANAGER_") || role.startsWith("HRMANAGER_"));
  return isOrganizationAdmin || (!allowHrManager && isHrManager);
}

function isEligiblePayslipTarget(employee: EmployeeRoleRecord, audience: Props["audience"]) {
  if (isExcludedHrTarget(employee, audience === "organization-admin")) return false;
  const roles = normalizedEmployeeRoles(employee);
  const allowedRoles = audience === "organization-admin"
    ? new Set(["HR_MANAGER", "HRMANAGER", "DEPARTMENT_MANAGER", "DEPARTMENTMANAGER", "EMPLOYEE"])
    : new Set(["DEPARTMENT_MANAGER", "DEPARTMENTMANAGER", "EMPLOYEE"]);
  return roles.length === 0 || roles.some((role) => allowedRoles.has(role));
}

async function loadEligibleEmployeeIds(audience: Props["audience"]) {
  const fetchPage = async (page: number) => {
    const response = await fetch(`/api/backend/employees?page=${page}&limit=100&sortBy=name&sortOrder=asc`, { credentials: "same-origin", cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message || `Unable to verify employee roles (${response.status})`);
    if (!Array.isArray(payload?.employees)) throw new Error("Unable to verify employee roles: the employee list response was invalid.");
    return { rows: payload.employees as EmployeeRoleRecord[], totalPages: Math.max(1, Number(payload?.pagination?.totalPages) || 1) };
  };
  const first = await fetchPage(1);
  const allRows = [...first.rows];
  if (first.totalPages > 10001) throw new Error("The employee list is too large to verify safely. Contact your administrator.");
  for (let page = 2; page <= first.totalPages; page += 1) {
    const result = await fetchPage(page);
    allRows.push(...result.rows);
  }
  return new Set(allRows.filter((employee) => typeof employee.id === "string" && isEligiblePayslipTarget(employee, audience)).map((employee) => employee.id as string));
}

export default function SalaryPaymentsWorkspace({ audience, employeeId, excludeEmployeeId }: Props) {
  const canEdit = audience === "hr-manager" || audience === "organization-admin";
  const [month, setMonth] = useState("");
  const [monthReady, setMonthReady] = useState(false);
  const [organizationTimeZone, setOrganizationTimeZone] = useState("");
  const [dateWarning, setDateWarning] = useState("");
  const [payslipStartMonth, setPayslipStartMonth] = useState("");
  const [payslipEndMonth, setPayslipEndMonth] = useState("");
  const [payslipLoading, setPayslipLoading] = useState("");
  const [payslipDialog, setPayslipDialog] = useState<PayslipDialogState | null>(null);
  const [savingPayslipStatuses, setSavingPayslipStatuses] = useState(false);
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
          setPayslipStartMonth(today.slice(0, 7));
          setPayslipEndMonth(today.slice(0, 7));
          setDateWarning("");
        }
      } catch {
        if (!cancelled) {
          setMonth(monthNow());
          setPayslipStartMonth(monthNow());
          setPayslipEndMonth(monthNow());
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
    if (!monthReady || !month) return;
    const requestId = ++loadRequestId.current;
    if (!silent) setLoading(true); setError("");
    try {
      const paymentRequest = fetch(`/api/backend/payroll/payments?month=${encodeURIComponent(month)}`, { credentials: "same-origin", cache: "no-store" });
      const eligibleIdsRequest = canEdit ? loadEligibleEmployeeIds(audience) : Promise.resolve(null);
      const [response, eligibleIds] = await Promise.all([paymentRequest, eligibleIdsRequest]);
      const payload = await response.json().catch(() => null);
      if (requestId !== loadRequestId.current) return;
      if (!response.ok) throw new Error(payload?.message || `Request failed (${response.status})`);
      const responseRows = Array.isArray(payload?.payments) ? payload.payments as Payment[] : [];
      // Verify target roles against the tenant-scoped employee API before displaying or editing payments.
      // Organization Admin can include HR Manager records; HR Manager cannot manage its own role record.
      const eligibleRows = eligibleIds ? responseRows.filter((payment) => eligibleIds.has(payment.employeeId)) : responseRows;
      // Department Managers may view team payroll on the team page, but their
      // personal earnings page must show only their own payment record.
      const rows = audience === "employee" && employeeId
        ? eligibleRows.filter((payment) => payment.employeeId === employeeId)
        : audience === "department-manager" && excludeEmployeeId
          ? eligibleRows.filter((payment) => payment.employeeId !== excludeEmployeeId)
          : eligibleRows;
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

  useEffect(() => {
    if (!payslipDialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingPayslipStatuses) {
        event.preventDefault();
        if (payslipPrintWindowRef.current && !payslipPrintWindowRef.current.closed) {
          payslipPrintWindowRef.current.close();
        }
        payslipPrintWindowRef.current = null;
        setPayslipDialog(null);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [payslipDialog, savingPayslipStatuses]);

  useWorkspaceAutoRefresh(() => load(true), {
    enabled: true,
    intervalMs: 60_000,
    shouldRefresh: () => monthReady && Boolean(month) && !loading && !saving && !paymentConfirmation && (!canEdit || !payments.some((payment) => {
      const draft = drafts[payment.employeeId];
      return !draft ||
        draft.amount !== (payment.amount == null ? "" : String(payment.amount)) ||
        draft.currencyCode !== (payment.currencyCode || "RWF") ||
        draft.status !== (payment.status === "PAID" ? "PAID" : "UNPAID") ||
        draft.paymentReference !== (payment.paymentReference || "") ||
        draft.notes !== (payment.notes || "");
    })),
  });
  const paidCount = payments.filter((payment) => payment.status === "PAID").length;
  const noHoursCount = payments.filter((payment) => payment.status === "NO_RECORDED_HOURS").length;
  const unpaidCount = payments.filter((payment) => payment.status === "UNPAID").length;
  const rateRequiredCount = payments.filter((payment) => payment.status === "RATE_REQUIRED").length;
  const currencyMismatchCount = payments.filter((payment) => payment.status === "CURRENCY_MISMATCH").length;
  const needsReviewCount = rateRequiredCount + currencyMismatchCount;
  const currencySummaries = useMemo(() => {
    const summary = new Map<string, { currencyCode: string; paid: number; outstanding: number; paidCount: number; unpaidCount: number }>();
    for (const payment of payments) {
      const currencyCode = (payment.currencyCode || "RWF").toUpperCase();
      const current = summary.get(currencyCode) || { currencyCode, paid: 0, outstanding: 0, paidCount: 0, unpaidCount: 0 };
      if (payment.status === "PAID") {
        current.paid += Number(payment.amount || 0);
        current.paidCount += 1;
      } else if (payment.status === "UNPAID") {
        current.outstanding += Number(payment.calculatedAmount ?? payment.amount ?? 0);
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
  const trackableCount = paidCount + unpaidCount;
  const paidProgress = trackableCount > 0 ? Math.round((paidCount / trackableCount) * 100) : 0;

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
      if (sortOption === "AMOUNT_DESC") return amountOf(b) - amountOf(a) || nameOf(a).localeCompare(nameOf(b));
      if (sortOption === "AMOUNT_ASC") return amountOf(a) - amountOf(b) || nameOf(a).localeCompare(nameOf(b));
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
    const headers = [
      "Employee", "Employee code", "Department", "Role", "Payroll month",
      "Worked hours", "Payable hours", "Payment status", "Amount",
      "Currency", "Paid at", "Payment reference", "Recorded by", "Notes",
    ];
    const rows = visiblePayments.map((payment) => {
      const name = [payment.firstName, payment.lastName].filter(Boolean).join(" ") || payment.employeeCode || "Employee";
      const amount = payment.status === "PAID" ? payment.amount : payment.calculatedAmount ?? payment.amount;
      const hours = (minutes: number | undefined) => {
        const safe = Math.max(0, Math.floor(Number(minutes) || 0));
        return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
      };
      return [
        name, payment.employeeCode || "", payment.departmentName || "", payment.workforceRole || "",
        month, hours(payment.workedMinutes), hours(payment.payableMinutes), payment.status,
        amount == null ? "" : Number(amount).toFixed(2), payment.currencyCode || "",
        payment.paidAt || "", payment.paymentReference || "", payment.recordedBy || "", payment.notes || "",
      ];
    });
    const csvCell = (value: unknown) => {
      const raw = String(value ?? "");
      const safe = /^[\\s]*[=+\\-@]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const csv = [headers, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\\r\\n");
    const blob = new Blob([String.fromCharCode(0xfeff), csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `payroll-register-${month}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function printSalarySlip(targetEmployeeId: string) {
    if (!canEdit || !targetEmployeeId || payslipLoading || payslipDialog) return;
    if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(payslipStartMonth) ||
        !/^\\d{4}-(0[1-9]|1[0-2])$/.test(payslipEndMonth)) {
      setError("Choose a valid start month and end month before printing.");
      return;
    }
    const startOrdinal = Number(payslipStartMonth.slice(0, 4)) * 12 + Number(payslipStartMonth.slice(5, 7)) - 1;
    const endOrdinal = Number(payslipEndMonth.slice(0, 4)) * 12 + Number(payslipEndMonth.slice(5, 7)) - 1;
    if (startOrdinal > endOrdinal) {
      setError("The payslip start month must be before or equal to the end month.");
      return;
    }
    if (endOrdinal - startOrdinal + 1 > 24) {
      setError("A salary slip can cover at most 24 months at a time.");
      return;
    }

    // Open a window synchronously from the click so the browser does not block printing later.
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("Your browser blocked the salary slip window. Allow pop-ups for this site and try again.");
      return;
    }
    payslipPrintWindowRef.current = printWindow;
    printWindow.document.open();
    printWindow.document.write("<!doctype html><html><head><title>Preparing salary slip</title></head><body style='font-family:Arial,sans-serif;padding:32px;color:#24354a'><h2>Preparing salary slip…</h2><p>Loading attendance, pay rates and monthly payment records.</p></body></html>");
    printWindow.document.close();
    window.focus();

    setPayslipLoading(targetEmployeeId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/backend/payroll/payslips/${encodeURIComponent(targetEmployeeId)}?startMonth=${encodeURIComponent(payslipStartMonth)}&endMonth=${encodeURIComponent(payslipEndMonth)}`,
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
      const statuses = Object.fromEntries(
        payload.months.map((item) => [item.month, item.payment.status === "PAID" ? "PAID" : "UNPAID" as PayslipPaymentStatus]),
      ) as Record<string, PayslipPaymentStatus>;
      setPayslipDialog({ employeeId: targetEmployeeId, employeeName, payload, statuses });
    } catch (caught) {
      if (!printWindow.closed) printWindow.close();
      payslipPrintWindowRef.current = null;
      setError(caught instanceof Error ? caught.message : "Unable to generate salary slip.");
    } finally {
      setPayslipLoading("");
    }
  }

  async function saveSalarySlipStatusesAndPrint() {
    const dialog = payslipDialog;
    if (!dialog || savingPayslipStatuses) return;
    setSavingPayslipStatuses(true);
    setError("");
    setNotice("");
    try {
      const statuses = dialog.payload.months.map((item) => ({
        month: item.month,
        status: dialog.statuses[item.month] || "UNPAID",
      }));
      const saveResponse = await fetch(
        `/api/backend/payroll/payslips/${encodeURIComponent(dialog.employeeId)}`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statuses }),
        },
      );
      const savePayload = await saveResponse.json().catch(() => null);
      if (!saveResponse.ok) {
        throw new Error(savePayload?.message || `Unable to save monthly payment statuses (${saveResponse.status}).`);
      }

      // Re-read the ledger so the printed document only contains persisted statuses.
      const query = new URLSearchParams({
        startMonth: dialog.payload.startMonth,
        endMonth: dialog.payload.endMonth,
      });
      const response = await fetch(
        `/api/backend/payroll/payslips/${encodeURIComponent(dialog.employeeId)}?${query.toString()}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const payload = await response.json().catch(() => null) as SalarySlipPayload | { message?: string } | null;
      if (!response.ok) {
        throw new Error(payload && "message" in payload && typeof payload.message === "string"
          ? payload.message
          : `Unable to reload saved salary slips (${response.status}).`);
      }
      if (!payload || !("months" in payload) || !Array.isArray(payload.months) ||
          payload.months.length === 0 || payload.months.some((item) => !item.payment.recorded)) {
        throw new Error("The monthly payment statuses were not all confirmed as stored. Reload the salary slip before printing.");
      }

      const printWindow = payslipPrintWindowRef.current;
      if (printWindow && !printWindow.closed) {
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
          });
          printWindow.print();
        };
        if (printWindow.document.readyState === "complete") {
          window.setTimeout(printWhenReady, 250);
        } else {
          printWindow.addEventListener("load", () => window.setTimeout(printWhenReady, 250), { once: true });
        }
        setNotice("Salary slip prepared. Every month’s PAID / UNPAID status has been saved to payroll.");
      } else {
        setNotice("Monthly PAID / UNPAID statuses have been saved to payroll, but the print window was closed. Select Print salary slip again to print.");
      }
      setPayslipDialog(null);
      payslipPrintWindowRef.current = null;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save monthly salary statuses.");
    } finally {
      setSavingPayslipStatuses(false);
    }
  }

  function cancelSalarySlipPreparation() {
    if (savingPayslipStatuses) return;
    if (payslipPrintWindowRef.current && !payslipPrintWindowRef.current.closed) {
      payslipPrintWindowRef.current.close();
    }
    payslipPrintWindowRef.current = null;
    setPayslipDialog(null);
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
  return <section className={`hr-manager-payroll-workspace min-w-0 space-y-5 rounded-2xl border border-white/[0.08] bg-[#141c28] p-4 shadow-lg shadow-black/10 sm:p-6 ${audience === "organization-admin" ? "oa-org-admin-time-pay" : ""}`}>
    <header className="flex min-w-0 flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sky-300">
          <BadgeDollarSign size={18}/>
          <span className="text-[11px] font-bold uppercase tracking-[0.16em]">Payroll</span>
          {!canEdit && <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/40 bg-slate-700/30 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-300"><LockKeyhole size={11}/>Read only</span>}
        </div>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">Salary payments</h2>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[170px] text-xs font-semibold text-slate-400">
          Payroll period
          <input type="month" value={month} disabled={!monthReady || Boolean(saving)} onChange={(event) => setMonth(event.target.value)} className={INPUT}/>
        </label>
        {organizationTimeZone && <span className="pb-2 text-xs text-slate-500">{organizationTimeZone}</span>}
        {canEdit && <Link href={audience === "hr-manager" ? "/hr/modules/pay-rates" : "/org/pay-rates"} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-600 bg-white/[0.025] px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]">Pay rates</Link>}
        <button type="button" onClick={exportPayrollRegister} disabled={loading || payments.length === 0 || visiblePayments.length === 0} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-600 bg-white/[0.025] px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40">
          <Download size={14}/>Export register
        </button>
      </div>
    </header>

    {dateWarning && <div role="status" className="rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-3 text-sm text-amber-100">{dateWarning}</div>}
    {error && <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><button type="button" disabled={loading || Boolean(saving)} onClick={() => void load()} className="min-h-9 shrink-0 rounded-lg border border-rose-300/20 px-3 py-1.5 text-xs font-bold text-rose-100 hover:bg-rose-300/10 disabled:opacity-50">{loading ? "Retrying…" : "Retry"}</button></div>}
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
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div><p className="text-[11px] text-slate-500">Paid</p><p className="mt-1 break-words text-base font-bold tabular-nums text-emerald-200">{money(summary.paid, summary.currencyCode)}</p><p className="mt-1 text-[10px] text-slate-500">{summary.paidCount} people</p></div>
              <div><p className="text-[11px] text-slate-500">Outstanding</p><p className="mt-1 break-words text-base font-bold tabular-nums text-amber-200">{money(summary.outstanding, summary.currencyCode)}</p><p className="mt-1 text-[10px] text-slate-500">{summary.unpaidCount} people</p></div>
            </div>
          </div>
        ))}
      </div>}
      <div className="mt-4 border-t border-white/[0.06] pt-3">
        <div className="mb-2 flex items-center justify-between gap-3 text-[11px]"><span className="font-semibold text-slate-400">Payment completion</span><span className="tabular-nums text-slate-300">{loading ? "—" : `${paidCount} / ${trackableCount} · ${paidProgress}%`}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{width:`${loading ? 0 : paidProgress}%`}}/></div>
      </div>
    </section>

    {canEdit && <section className="rounded-2xl border border-sky-400/15 bg-sky-400/[0.025] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sky-200"><FileDown size={16}/><h3 className="text-sm font-semibold">Salary slips</h3></div>
        <span className="text-[11px] text-slate-500">A4 PDF · One page per month</span>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="min-w-[155px] text-xs font-semibold text-slate-400">Start month<input type="month" value={payslipStartMonth} disabled={!monthReady || Boolean(payslipLoading) || Boolean(payslipDialog)} onChange={(event) => setPayslipStartMonth(event.target.value)} className={INPUT}/></label>
        <label className="min-w-[155px] text-xs font-semibold text-slate-400">End month<input type="month" value={payslipEndMonth} disabled={!monthReady || Boolean(payslipLoading) || Boolean(payslipDialog)} onChange={(event) => setPayslipEndMonth(event.target.value)} className={INPUT}/></label>
      </div>
    </section>}

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
              <option value="AMOUNT_DESC">Amount · High–low</option>
              <option value="AMOUNT_ASC">Amount · Low–high</option>
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
                    <p className="mt-1 text-[10px] text-slate-500">{payment.paymentRecorded ? "Payment record stored" : "No payment record"}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="whitespace-nowrap text-xs text-slate-300">{payment.paidAt ? new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(new Date(payment.paidAt)) : "—"}</p>
                    <p className="mt-1 max-w-[180px] truncate text-[10px] text-slate-500" title={payment.paymentReference || ""}>{payment.paymentReference || "No reference"}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setExpandedEmployeeId(isExpanded ? "" : payment.employeeId)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-white/[0.05]">
                        {isExpanded ? <ChevronDown size={13}/> : canEdit ? <Pencil size={13}/> : <Eye size={13}/>}
                        {isExpanded ? "Close" : canEdit ? "Manage" : "View"}
                      </button>
                      {canEdit && <button type="button" onClick={() => void printSalarySlip(payment.employeeId)} disabled={Boolean(payslipLoading) || Boolean(payslipDialog) || !payslipStartMonth || !payslipEndMonth} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-sky-300/20 bg-sky-300/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-sky-200 transition hover:bg-sky-300/[0.12] disabled:opacity-40">
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
                      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-3">
                        <div><p className="text-[10px] text-slate-500">Currency</p><p className="mt-1 text-sm font-semibold text-slate-200">{payment.currencyCode}</p></div>
                        <div><p className="text-[10px] text-slate-500">Payable time</p><p className="mt-1 text-sm font-semibold text-slate-200">{Math.floor(Math.max(0,payment.payableMinutes||0)/60)}h {String(Math.max(0,payment.payableMinutes||0)%60).padStart(2,"0")}m</p></div>
                        <div><p className="text-[10px] text-slate-500">Paid leave</p><p className="mt-1 text-sm font-semibold text-slate-200">{Math.floor(Math.max(0,payment.paidLeaveMinutes||0)/60)}h {String(Math.max(0,payment.paidLeaveMinutes||0)%60).padStart(2,"0")}m</p></div>
                        <div><p className="text-[10px] text-slate-500">Paid holidays</p><p className="mt-1 text-sm font-semibold text-slate-200">{Math.floor(Math.max(0,payment.paidHolidayMinutes||0)/60)}h {String(Math.max(0,payment.paidHolidayMinutes||0)%60).padStart(2,"0")}m</p></div>
                      </div>
                    </div>
                    {canEdit ? <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold text-white">Payment record</h4><span className="text-[10px] text-slate-500">{payment.paymentRecorded ? `Last updated ${payment.updatedAt ? new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(payment.updatedAt)) : "—"}` : "Not yet recorded"}</span></div>
                      <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                        <label className="block text-xs font-medium text-slate-400">Payment status<select value={draft.status} onChange={(event) => setDrafts((old) => ({...old,[payment.employeeId]:{...draft,status:event.target.value as "PAID"|"UNPAID"}}))} className={INPUT}><option value="UNPAID">Unpaid</option><option value="PAID">Paid</option></select></label>
                        <label className="block text-xs font-medium text-slate-400">Payment reference<input maxLength={120} value={draft.paymentReference} onChange={(event) => setDrafts((old) => ({...old,[payment.employeeId]:{...draft,paymentReference:event.target.value}}))} className={INPUT} placeholder="Bank / transfer reference"/></label>
                        <label className="block text-xs font-medium text-slate-400 sm:col-span-2">Notes<input maxLength={1000} value={draft.notes} onChange={(event) => setDrafts((old) => ({...old,[payment.employeeId]:{...draft,notes:event.target.value}}))} className={INPUT} placeholder="Payment note"/></label>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                        <p className="max-w-2xl text-[11px] leading-5 text-slate-500">{payment.payableMinutes <= 0 ? "No payable hours are available for this month." : payment.status === "CURRENCY_MISMATCH" ? "Resolve the currency mismatch in pay-rate history first." : payment.calculatedAmount == null ? "A valid effective pay rate is required before payment can be recorded." : "The payable amount is calculated from attendance, approved overtime, paid absences and effective pay rates."}</p>
                        <button type="button" className={BUTTON} disabled={Boolean(saving) || (payment.payableMinutes || 0) <= 0 || payment.calculatedAmount == null} onClick={() => void save(payment.employeeId)}>{saving === payment.employeeId ? <RefreshCw size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>}Save payment</button>
                      </div>
                    </div> : <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                      <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold text-white">Payment record</h4><span className="inline-flex items-center gap-1 rounded-full border border-slate-600 px-2 py-1 text-[10px] font-semibold text-slate-400"><LockKeyhole size={10}/>Read only</span></div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div><p className="text-[10px] text-slate-500">Paid at</p><p className="mt-1 text-sm text-slate-200">{payment.paidAt ? new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(payment.paidAt)) : "Not paid"}</p></div>
                        <div><p className="text-[10px] text-slate-500">Payment reference</p><p className="mt-1 break-all text-sm text-slate-200">{payment.paymentReference || "—"}</p></div>
                        <div><p className="text-[10px] text-slate-500">Recorded by</p><p className="mt-1 text-sm text-slate-200">{payment.recordedBy || "—"}</p></div>
                        <div><p className="text-[10px] text-slate-500">Last updated</p><p className="mt-1 text-sm text-slate-200">{payment.updatedAt ? new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(payment.updatedAt)) : "—"}</p></div>
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
          if (event.target === event.currentTarget && !savingPayslipStatuses) cancelSalarySlipPreparation();
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="salary-slip-status-title"
          aria-describedby="salary-slip-status-description"
          className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#111a28] p-4 text-white shadow-[0_28px_80px_rgba(0,0,0,0.5)] sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-sky-300"><FileDown size={15} /> Monthly payroll status</span>
              <h2 id="salary-slip-status-title" className="mt-2 text-xl font-bold">Confirm each month’s payment status</h2>
              <p className="mt-1 text-sm text-slate-300">{payslipDialog.employeeName}</p>
            </div>
            <button
              type="button"
              onClick={cancelSalarySlipPreparation}
              disabled={savingPayslipStatuses}
              aria-label="Close salary slip status confirmation"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-slate-700 text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <p id="salary-slip-status-description" className="mt-4 rounded-xl border border-sky-300/15 bg-sky-300/[0.05] p-3 text-sm leading-6 text-slate-300">
            Choose the actual payment status for every month in this salary slip. These choices are saved in the monthly payroll ledger before the PDF is produced. Months without a saved status default to UNPAID.
          </p>

          <div className="mt-4 space-y-2">
            {payslipDialog.payload.months.map((monthRecord) => {
              const status = payslipDialog.statuses[monthRecord.month] || "UNPAID";
              const originalStatus = monthRecord.payment.status === "PAID" ? "PAID" : "UNPAID";
              const hasSavedSelection = monthRecord.payment.recorded && status === originalStatus;
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
                      {hasSavedSelection
                        ? "Status already stored in payroll"
                        : monthRecord.payment.recorded
                          ? "Changed — will be saved before printing"
                          : "Not stored yet — will be saved before printing"}
                    </p>
                    {status === "PAID" && (
                      <p className="mt-1 text-xs text-amber-200">
                        PAID is accepted only when complete payable earnings and valid rates are available.
                      </p>
                    )}
                  </div>
                  <label className="block text-xs font-semibold text-slate-400">
                    Payment status
                    <select
                      value={status}
                      disabled={savingPayslipStatuses}
                      onChange={(event) => {
                        const nextStatus = event.target.value as PayslipPaymentStatus;
                        setPayslipDialog((current) => current ? {
                          ...current,
                          statuses: {
                            ...current.statuses,
                            [monthRecord.month]: nextStatus,
                          },
                        } : current);
                      }}
                      className={INPUT}
                    >
                      <option value="UNPAID">UNPAID</option>
                      <option value="PAID">PAID</option>
                    </select>
                  </label>
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
              disabled={savingPayslipStatuses}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.05] disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveSalarySlipStatusesAndPrint()}
              disabled={savingPayslipStatuses}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 disabled:cursor-wait disabled:opacity-50"
            >
              {savingPayslipStatuses ? <RefreshCw size={15} className="animate-spin" /> : <Printer size={15} />}
              {savingPayslipStatuses ? "Saving statuses…" : "Save statuses & print"}
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

