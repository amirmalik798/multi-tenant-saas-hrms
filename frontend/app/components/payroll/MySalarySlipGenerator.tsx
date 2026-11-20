"use client";

import { useEffect, useState } from "react";
import { FileDown, LoaderCircle, Printer } from "lucide-react";
import { buildSalarySlipDocument, type SalarySlipPayload } from "./salary-slip-document";

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function validMonth(value: string): boolean {
  return /^\\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function monthOrdinal(value: string): number {
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}

function expectedMonthCount(startMonth: string, endMonth: string): number {
  return monthOrdinal(endMonth) - monthOrdinal(startMonth) + 1;
}

export default function MySalarySlipGenerator({ employeeId }: { employeeId: string }) {
  const [organizationMonth, setOrganizationMonth] = useState("");
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [dateLoading, setDateLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    async function loadOrganizationMonth() {
      setDateLoading(true);
      setError("");
      try {
        const seedDate = localDate();
        const response = await fetch(
          `/api/backend/attendance/calendar?fromDate=${encodeURIComponent(seedDate)}&toDate=${encodeURIComponent(seedDate)}`,
          { credentials: "same-origin", cache: "no-store" },
        );
        const payload = await response.json().catch(() => null) as { today?: unknown; message?: unknown } | null;
        const today = typeof payload?.today === "string" && /^\\d{4}-\\d{2}-\\d{2}$/.test(payload.today)
          ? payload.today
          : "";
        if (!response.ok || !today) {
          throw new Error(
            typeof payload?.message === "string"
              ? payload.message
              : "The organization's current payroll month could not be verified.",
          );
        }
        if (active) {
          const currentMonth = today.slice(0, 7);
          setOrganizationMonth(currentMonth);
          setFromMonth((current) => current || currentMonth);
          setToMonth((current) => current || currentMonth);
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Unable to load the organization's current payroll month.");
        }
      } finally {
        if (active) setDateLoading(false);
      }
    }

    void loadOrganizationMonth();
    return () => { active = false; };
  }, []);

  async function generatePayslip() {
    if (generating) return;
    setError("");
    setNotice("");

    if (!employeeId) {
      setError("Your employee record could not be verified. Please sign in again.");
      return;
    }
    if (!validMonth(fromMonth) || !validMonth(toMonth)) {
      setError("Choose valid start and end months.");
      return;
    }
    const monthCount = expectedMonthCount(fromMonth, toMonth);
    if (monthCount < 1) {
      setError("The start month must be before or equal to the end month.");
      return;
    }
    if (monthCount > 24) {
      setError("A salary slip can cover at most 24 months at a time.");
      return;
    }
    if (!validMonth(organizationMonth) || monthOrdinal(toMonth) > monthOrdinal(organizationMonth)) {
      setError("Future payroll months cannot be included. Select a range ending no later than the current organization month.");
      return;
    }

    // Open the print window during the click gesture so browser popup blockers
    // do not discard the payslip after the asynchronous payroll request.
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("Your browser blocked the salary slip window. Allow pop-ups for this site and try again.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(
      "<!doctype html><html><head><title>Preparing your salary slip</title></head><body style='font-family:Arial,sans-serif;padding:32px;color:#24354a'><h2>Preparing your salary slip…</h2><p>Loading your attendance, pay rates and current payment statuses.</p></body></html>",
    );
    printWindow.document.close();
    setGenerating(true);

    try {
      const query = new URLSearchParams({ startMonth: fromMonth, endMonth: toMonth });
      const response = await fetch(
        `/api/backend/payroll/payslips/${encodeURIComponent(employeeId)}?${query.toString()}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const payload = await response.json().catch(() => null) as SalarySlipPayload | { message?: string } | null;
      if (!response.ok) {
        throw new Error(
          payload && "message" in payload && typeof payload.message === "string"
            ? payload.message
            : `Unable to generate your salary slip (${response.status}).`,
        );
      }
      if (
        !payload ||
        !("months" in payload) ||
        !payload.employee ||
        payload.employee.id !== employeeId ||
        payload.startMonth !== fromMonth ||
        payload.endMonth !== toMonth ||
        !Array.isArray(payload.months) ||
        payload.months.length !== monthCount
      ) {
        throw new Error("The salary slip data was incomplete or did not match the selected monthly period. Please try again.");
      }

      if (printWindow.closed) {
        setNotice("Your salary slip data was prepared, but the print window was closed. Generate it again to print or save it.");
        return;
      }

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

      const paidCount = payload.months.filter((month) => month.payment.status === "PAID").length;
      const unpaidCount = payload.months.length - paidCount;
      setNotice(`Your ${monthCount}-month payslip is ready: ${paidCount} PAID and ${unpaidCount} UNPAID month(s). Generating a payslip does not change payroll records.`);
    } catch (caught) {
      if (!printWindow.closed) printWindow.close();
      setError(caught instanceof Error ? caught.message : "Unable to generate your salary slip.");
    } finally {
      setGenerating(false);
    }
  }

  const canGenerate = Boolean(
    employeeId &&
    validMonth(organizationMonth) &&
    validMonth(fromMonth) &&
    validMonth(toMonth) &&
    !dateLoading &&
    !generating
  );

  return (
    <section className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#141c28] p-5 text-slate-100 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-300/[0.08] text-sky-200">
          <FileDown size={19} />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-white">Generate my payslip</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Choose one month or a month-to-month period to prepare your own salary statements. You can print them or save them as a PDF.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block text-xs font-semibold text-slate-300">
          From month
          <input
            type="month"
            min="2000-01"
            max={organizationMonth || undefined}
            value={fromMonth}
            disabled={dateLoading || generating}
            onChange={(event) => setFromMonth(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-700 bg-[#0b111b] px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-400 disabled:opacity-50"
          />
        </label>
        <label className="block text-xs font-semibold text-slate-300">
          To month
          <input
            type="month"
            min={fromMonth || "2000-01"}
            max={organizationMonth || undefined}
            value={toMonth}
            disabled={dateLoading || generating}
            onChange={(event) => setToMonth(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-700 bg-[#0b111b] px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-400 disabled:opacity-50"
          />
        </label>
        <button
          type="button"
          onClick={() => void generatePayslip()}
          disabled={!canGenerate}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {generating ? <LoaderCircle size={16} className="animate-spin" /> : <Printer size={16} />}
          {dateLoading ? "Loading month…" : generating ? "Preparing…" : "Generate payslip"}
        </button>
      </div>

      <p className="text-xs leading-5 text-slate-500">
        The selected period can include up to 24 months and cannot extend beyond the current organization month. Each month displays its payroll payment status. Generating a payslip does not create, edit or mark any payment as paid.
      </p>

      {error && <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm leading-6 text-rose-200">{error}</div>}
      {notice && <div role="status" aria-live="polite" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-sm leading-6 text-emerald-200">{notice}</div>}
    </section>
  );
}
