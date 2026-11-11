const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = 568;
const MAIN_ROW_HEIGHT = 33;
const MAIN_ROWS_PER_PAGE = 10;

type PdfEvent = {
  id?: string;
  eventType?: string;
  recordedAt?: string | Date | null;
  timeZone?: string | null;
  source?: string | null;
};

export type DailyAttendanceRecord = {
  employeeId: string;
  employeeCode: string | null;
  firstName: string | null;
  lastName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  employmentStatus: string | null;
  scheduleName: string | null;
  timeZone: string | null;
  expectedStart: string | Date | null;
  expectedEnd: string | Date | null;
  scheduledBreakMinutes: number | string | null;
  firstClockIn: string | Date | null;
  lastClockOut: string | Date | null;
  eventCount: number | string;
  events: PdfEvent[] | null;
  approvedOvertimeMinutes?: number | string | null;
  calculationStatus?: string;
  actualElapsedMinutes?: number;
  breakDeductedMinutes?: number;
  workedMinutes?: number;
  regularWorkedMinutes?: number;
  potentialOvertimeMinutes?: number;
  payableOvertimeMinutes?: number;
  excessUnapprovedOvertimeMinutes?: number;
};

export type DailyAttendanceReport = {
  organizationName: string;
  reportDate: string;
  timeZone: string;
  reportScope: "Organization-wide" | string;
  generatedAt: Date;
  generatedBy: string;
  rows: DailyAttendanceRecord[];
};

type RGB = [number, number, number];
type PdfPage = { content: string[] };

type Analysis = {
  status: string;
  statusKind: "positive" | "warning" | "danger" | "neutral";
  completedSeconds: number;
  openSeconds: number;
  hasOpenSession: boolean;
  invalidSequence: boolean;
};

const COLORS = {
  navy: [0.055, 0.105, 0.18] as RGB,
  navyLight: [0.09, 0.16, 0.25] as RGB,
  teal: [0.05, 0.48, 0.45] as RGB,
  tealLight: [0.84, 0.96, 0.94] as RGB,
  ink: [0.08, 0.13, 0.2] as RGB,
  body: [0.18, 0.24, 0.32] as RGB,
  muted: [0.38, 0.44, 0.52] as RGB,
  border: [0.85, 0.88, 0.92] as RGB,
  panel: [0.95, 0.965, 0.98] as RGB,
  rowAlt: [0.975, 0.982, 0.99] as RGB,
  white: [1, 1, 1] as RGB,
  green: [0.05, 0.43, 0.29] as RGB,
  greenLight: [0.9, 0.97, 0.93] as RGB,
  amber: [0.64, 0.35, 0.02] as RGB,
  amberLight: [1, 0.96, 0.87] as RGB,
  red: [0.69, 0.16, 0.17] as RGB,
  redLight: [1, 0.92, 0.92] as RGB,
  blue: [0.09, 0.32, 0.63] as RGB,
  blueLight: [0.91, 0.95, 1] as RGB,
  grayLight: [0.93, 0.95, 0.97] as RGB,
} as const;

function numberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ascii(value: unknown): string {
  const input = value === null || value === undefined ? "" : String(value);
  return input
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2022/g, "-")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

function escapePdf(value: unknown): string {
  return ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function color(value: RGB): string {
  return value.map((channel) => channel.toFixed(3)).join(" ");
}

function fmt(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function textWidth(value: string, size: number, bold = false): number {
  const str = ascii(value);
  let total = 0;

  for (const char of str) {
    if (char === " ") total += 0.27;
    else if ("ilI.,:;!'|`".includes(char)) total += 0.25;
    else if ("mwMW@%&".includes(char)) total += bold ? 0.78 : 0.74;
    else if (/[A-Z0-9]/.test(char)) total += bold ? 0.63 : 0.59;
    else if ("()[]{}<>".includes(char)) total += 0.32;
    else total += bold ? 0.55 : 0.51;
  }

  return total * size;
}

function fitText(value: unknown, maxWidth: number, size: number, bold = false): string {
  const str = ascii(value).replace(/\s+/g, " ").trim();
  if (!str || maxWidth <= 0) return "";
  if (textWidth(str, size, bold) <= maxWidth) return str;

  let result = "";
  for (const char of str) {
    if (textWidth(`${result}${char}...`, size, bold) > maxWidth) break;
    result += char;
  }
  return result ? `${result.trimEnd()}...` : "";
}

function wrapText(value: unknown, maxWidth: number, size: number, maxLines: number, bold = false): string[] {
  const text = ascii(value).replace(/\s+/g, " ").trim();
  if (!text) return [];

  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, size, bold) <= maxWidth) {
      current = candidate;
    } else if (!current) {
      lines.push(fitText(word, maxWidth, size, bold));
    } else {
      lines.push(current);
      current = word;
    }

    if (lines.length >= maxLines) {
      current = "";
      break;
    }
  }

  if (current && lines.length < maxLines) lines.push(current);

  const consumed = lines.join(" ");
  if (consumed.length < text.length && lines.length) {
    lines[lines.length - 1] = fitText(`${lines[lines.length - 1]}...`, maxWidth, size, bold);
  }

  return lines.slice(0, maxLines);
}

function drawRect(page: PdfPage, x: number, top: number, width: number, height: number, fill: RGB): void {
  const y = PAGE_HEIGHT - top - height;
  page.content.push(`q ${color(fill)} rg ${fmt(x)} ${fmt(y)} ${fmt(width)} ${fmt(height)} re f Q`);
}

function drawLine(page: PdfPage, x1: number, top1: number, x2: number, top2: number, stroke: RGB, width = 0.5): void {
  page.content.push(`q ${color(stroke)} RG ${fmt(width)} w ${fmt(x1)} ${fmt(PAGE_HEIGHT - top1)} m ${fmt(x2)} ${fmt(PAGE_HEIGHT - top2)} l S Q`);
}

function drawText(
  page: PdfPage,
  value: unknown,
  x: number,
  top: number,
  size: number,
  fill: RGB = COLORS.body,
  bold = false,
  maxWidth?: number,
): void {
  const content = maxWidth === undefined ? ascii(value) : fitText(value, maxWidth, size, bold);
  if (!content) return;
  const y = PAGE_HEIGHT - top - size;
  page.content.push(
    `BT /${bold ? "F2" : "F1"} ${fmt(size)} Tf ${color(fill)} rg 1 0 0 1 ${fmt(x)} ${fmt(y)} Tm (${escapePdf(content)}) Tj ET`,
  );
}

function drawRightText(page: PdfPage, value: unknown, right: number, top: number, size: number, fill: RGB, bold = false): void {
  const str = ascii(value);
  drawText(page, str, right - textWidth(str, size, bold), top, size, fill, bold);
}

function drawWrapped(
  page: PdfPage,
  value: unknown,
  x: number,
  top: number,
  width: number,
  size: number,
  fill: RGB,
  maxLines: number,
  lineHeight = size + 2,
  bold = false,
): void {
  const lines = wrapText(value, width, size, maxLines, bold);
  lines.forEach((line, index) => drawText(page, line, x, top + index * lineHeight, size, fill, bold, width));
}

function personName(row: DailyAttendanceRecord): string {
  return [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || row.employeeCode || "Employee";
}

function humanize(value: string | null | undefined): string {
  return value
    ? value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Not recorded";
}

function formatReportDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  } catch {
    return value;
  }
}

function formatGeneratedAt(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 16).replace("T", " ");
  }
}

function formatTime(value: string | Date | null | undefined, timeZone: string): string {
  const date = asDate(value);
  if (!date) return "-";

  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function analyse(row: DailyAttendanceRecord, generatedAt: Date): Analysis {
  const events = Array.isArray(row.events) ? [...row.events] : [];
  events.sort((a, b) => {
    const aTime = asDate(a.recordedAt)?.getTime() ?? 0;
    const bTime = asDate(b.recordedAt)?.getTime() ?? 0;
    return aTime - bTime || ascii(a.id).localeCompare(ascii(b.id));
  });

  let openClockIn: Date | null = null;
  let completedSeconds = 0;
  let invalidSequence = false;

  for (const event of events) {
    const eventType = (event.eventType ?? "").toUpperCase();
    const timestamp = asDate(event.recordedAt);

    if (!timestamp || (eventType !== "CLOCK_IN" && eventType !== "CLOCK_OUT")) {
      invalidSequence = true;
      continue;
    }

    if (eventType === "CLOCK_IN") {
      if (openClockIn) {
        invalidSequence = true;
      } else {
        openClockIn = timestamp;
      }
      continue;
    }

    if (!openClockIn) {
      invalidSequence = true;
      continue;
    }

    const seconds = Math.floor((timestamp.getTime() - openClockIn.getTime()) / 1000);
    if (seconds <= 0) {
      invalidSequence = true;
    } else {
      completedSeconds += seconds;
    }
    openClockIn = null;
  }

  const hasOpenSession = Boolean(openClockIn);
  const openSeconds = openClockIn
    ? Math.max(0, Math.floor((generatedAt.getTime() - openClockIn.getTime()) / 1000))
    : 0;
  const hasSchedule = Boolean(row.scheduleName && row.expectedStart);
  const hasEvents = events.length > 0;

  if (invalidSequence) {
    return {
      status: "Review punches",
      statusKind: "danger",
      completedSeconds,
      openSeconds: 0,
      hasOpenSession,
      invalidSequence: true,
    };
  }

  if (hasOpenSession) {
    return {
      status: hasSchedule ? "Clocked in" : "Clocked in - no shift",
      statusKind: "positive",
      completedSeconds,
      openSeconds,
      hasOpenSession: true,
      invalidSequence: false,
    };
  }

  if (hasEvents) {
    return {
      status: hasSchedule ? "Clocked out" : "Recorded - no shift",
      statusKind: hasSchedule ? "positive" : "warning",
      completedSeconds,
      openSeconds: 0,
      hasOpenSession: false,
      invalidSequence: false,
    };
  }

  if (hasSchedule) {
    return {
      status: "No punches recorded",
      statusKind: "warning",
      completedSeconds: 0,
      openSeconds: 0,
      hasOpenSession: false,
      invalidSequence: false,
    };
  }

  return {
    status: "No shift / no punches",
    statusKind: "neutral",
    completedSeconds: 0,
    openSeconds: 0,
    hasOpenSession: false,
    invalidSequence: false,
  };
}

function analysisDuration(analysis: Analysis): string {
  if (analysis.invalidSequence) return "Review";
  if (analysis.completedSeconds === 0 && analysis.openSeconds === 0) return "-";
  const total = analysis.completedSeconds + analysis.openSeconds;
  return `${formatDuration(total)}${analysis.hasOpenSession ? "*" : ""}`;
}

function statusColor(analysis: Analysis): RGB {
  if (analysis.statusKind === "positive") return COLORS.green;
  if (analysis.statusKind === "warning") return COLORS.amber;
  if (analysis.statusKind === "danger") return COLORS.red;
  return COLORS.muted;
}

function drawHeader(page: PdfPage, report: DailyAttendanceReport, continuation: boolean): void {
  drawRect(page, 0, 0, PAGE_WIDTH, 79, COLORS.navy);
  drawRect(page, MARGIN, 18, 4, 42, COLORS.teal);
  drawText(page, "HRMS  /  WORKFORCE OPERATIONS", MARGIN + 13, 13, 7.1, [0.56, 0.88, 0.83], true);
  drawText(page, report.organizationName || "Organization", MARGIN + 13, 28, 15.5, COLORS.white, true, 435);
  drawText(page, "ATTENDANCE REPORT", MARGIN + 13, 52, 7, [0.76, 0.83, 0.9], true);

  drawRightText(page, continuation ? "DAILY ATTENDANCE REPORT - CONTINUED" : "DAILY ATTENDANCE REPORT", PAGE_WIDTH - MARGIN, 17, 12.4, COLORS.white, true);
  drawRightText(page, formatReportDate(report.reportDate), PAGE_WIDTH - MARGIN, 38, 8.2, [0.86, 0.9, 0.96]);
  drawRightText(page, `Generated ${formatGeneratedAt(report.generatedAt, report.timeZone)} (${report.timeZone})`, PAGE_WIDTH - MARGIN, 55, 6.5, [0.72, 0.79, 0.87]);

  drawRect(page, 0, 79, PAGE_WIDTH, 28, COLORS.panel);
  drawText(page, "REPORT SCOPE", MARGIN, 84, 5.8, COLORS.muted, true);
  drawText(page, report.reportScope, MARGIN, 94, 7, COLORS.ink, true, 350);
  drawText(page, "TIME ZONE", 450, 84, 5.8, COLORS.muted, true);
  drawText(page, report.timeZone, 450, 94, 7, COLORS.ink, true, 165);
  drawText(page, "PREPARED BY", 635, 84, 5.8, COLORS.muted, true);
  drawText(page, report.generatedBy, 635, 94, 7, COLORS.ink, true, 178);
}

function getMetrics(report: DailyAttendanceReport) {
  const analyses = report.rows.map((row) => analyse(row, report.generatedAt));
  const scheduled = report.rows.filter((row) => Boolean(row.scheduleName && row.expectedStart)).length;
  const clockedIn = analyses.filter((analysis) => analysis.hasOpenSession && !analysis.invalidSequence).length;
  const clockedOut = analyses.filter((analysis) => analysis.status === "Clocked out").length;
  const noPunches = report.rows.filter(
    (row) => Boolean(row.scheduleName && row.expectedStart) && (!row.events || row.events.length === 0),
  ).length;
  return { activeEmployees: report.rows.length, scheduled, clockedIn, clockedOut, noPunches };
}

function drawSummary(page: PdfPage, report: DailyAttendanceReport): void {
  const metrics = getMetrics(report);
  const items = [
    { label: "ACTIVE EMPLOYEES", value: metrics.activeEmployees, accent: COLORS.navyLight },
    { label: "SCHEDULED TODAY", value: metrics.scheduled, accent: COLORS.blue },
    { label: "CLOCKED IN NOW", value: metrics.clockedIn, accent: COLORS.teal },
    { label: "CLOCKED OUT", value: metrics.clockedOut, accent: COLORS.green },
    { label: "SCHEDULED, NO PUNCHES", value: metrics.noPunches, accent: metrics.noPunches ? COLORS.amber : COLORS.green },
  ];

  const gap = 7;
  const cardWidth = (CONTENT_WIDTH - gap * (items.length - 1)) / items.length;
  const top = 118;
  const height = 48;

  items.forEach((item, index) => {
    const x = MARGIN + index * (cardWidth + gap);
    drawRect(page, x, top, cardWidth, height, COLORS.panel);
    drawRect(page, x, top, 3, height, item.accent);
    drawText(page, item.label, x + 9, top + 7, 5.6, COLORS.muted, true, cardWidth - 17);
    drawText(page, item.value, x + 9, top + 19, 16, COLORS.ink, true);
  });

  drawText(page, "POINT-IN-TIME SNAPSHOT", MARGIN, 174, 6.2, COLORS.teal, true);
  drawText(
    page,
    "Snapshot at generation time. No punches do not confirm absence. Recorded elapsed time is not payable time; scheduled breaks are not automatically deducted. Open sessions are marked *.",
    MARGIN + 113,
    174,
    6.3,
    COLORS.muted,
    false,
    CONTENT_WIDTH - 113,
  );
}

const MAIN_COLUMNS = [
  { label: "EMPLOYEE", width: 145 },
  { label: "DEPARTMENT", width: 95 },
  { label: "SCHEDULE / HOURS", width: 155 },
  { label: "FIRST IN", width: 65 },
  { label: "LAST OUT", width: 65 },
  { label: "RECORDED*", width: 75 },
  { label: "ATTENDANCE STATUS", width: 185 },
] as const;

function drawMainTableHeader(page: PdfPage, top: number): void {
  drawRect(page, MARGIN, top, CONTENT_WIDTH, 27, COLORS.navyLight);
  let x = MARGIN;
  for (const column of MAIN_COLUMNS) {
    drawText(page, column.label, x + 5, top + 9, 5.7, COLORS.white, true, column.width - 9);
    x += column.width;
  }
}

function drawMainRow(page: PdfPage, row: DailyAttendanceRecord, index: number, top: number, report: DailyAttendanceReport): void {
  const height = MAIN_ROW_HEIGHT;
  const background = index % 2 === 0 ? COLORS.white : COLORS.rowAlt;
  drawRect(page, MARGIN, top, CONTENT_WIDTH, height, background);
  drawLine(page, MARGIN, top + height, MARGIN + CONTENT_WIDTH, top + height, COLORS.border, 0.45);

  const a = analyse(row, report.generatedAt);
  const cells: Array<{ width: number; draw: (x: number) => void }> = [];
  const startX = MARGIN;

  cells.push({
    width: MAIN_COLUMNS[0].width,
    draw: (x) => {
      drawText(page, personName(row), x + 5, top + 5, 7, COLORS.ink, true, MAIN_COLUMNS[0].width - 10);
      drawText(page, row.employeeCode || "No employee code", x + 5, top + 18, 5.9, COLORS.muted, false, MAIN_COLUMNS[0].width - 10);
    },
  });
  cells.push({
    width: MAIN_COLUMNS[1].width,
    draw: (x) => drawWrapped(page, row.departmentName || "Unassigned", x + 5, top + 7, MAIN_COLUMNS[1].width - 10, 6.5, COLORS.body, 2, 8),
  });
  cells.push({
    width: MAIN_COLUMNS[2].width,
    draw: (x) => {
      drawText(page, row.scheduleName || "No shift scheduled", x + 5, top + 5, 6.7, row.scheduleName ? COLORS.ink : COLORS.muted, Boolean(row.scheduleName), MAIN_COLUMNS[2].width - 10);
      const times = row.expectedStart && row.expectedEnd
        ? `${formatTime(row.expectedStart, row.timeZone || report.timeZone)} - ${formatTime(row.expectedEnd, row.timeZone || report.timeZone)}${numberOrZero(row.scheduledBreakMinutes) ? ` / ${numberOrZero(row.scheduledBreakMinutes)}m break` : ""}`
        : "No expected hours";
      drawText(page, times, x + 5, top + 18, 5.65, COLORS.muted, false, MAIN_COLUMNS[2].width - 10);
    },
  });
  cells.push({
    width: MAIN_COLUMNS[3].width,
    draw: (x) => drawText(page, formatTime(row.firstClockIn, row.timeZone || report.timeZone), x + 5, top + 12, 6.6, row.firstClockIn ? COLORS.ink : COLORS.muted, Boolean(row.firstClockIn), MAIN_COLUMNS[3].width - 8),
  });
  cells.push({
    width: MAIN_COLUMNS[4].width,
    draw: (x) => drawText(page, formatTime(row.lastClockOut, row.timeZone || report.timeZone), x + 5, top + 12, 6.6, row.lastClockOut ? COLORS.ink : COLORS.muted, Boolean(row.lastClockOut), MAIN_COLUMNS[4].width - 8),
  });
  cells.push({
    width: MAIN_COLUMNS[5].width,
    draw: (x) => drawText(page, analysisDuration(a), x + 5, top + 12, 6.3, a.invalidSequence ? COLORS.red : COLORS.ink, true, MAIN_COLUMNS[5].width - 8),
  });
  cells.push({
    width: MAIN_COLUMNS[6].width,
    draw: (x) => drawWrapped(page, a.status, x + 5, top + 8, MAIN_COLUMNS[6].width - 9, 6.2, statusColor(a), 2, 8, true),
  });


  let x = startX;
  for (const cell of cells) {
    cell.draw(x);
    x += cell.width;
  }
}

function newPage(): PdfPage {
  return { content: [] };
}

function drawMainPages(report: DailyAttendanceReport): PdfPage[] {
  const rows = report.rows;
  const pageCount = Math.max(1, Math.ceil(rows.length / MAIN_ROWS_PER_PAGE));
  const pages: PdfPage[] = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = newPage();
    drawHeader(page, report, pageIndex > 0);
    drawSummary(page, report);
    drawText(page, "DAILY ATTENDANCE REGISTER", MARGIN, 190, 8.4, COLORS.ink, true);
    drawRightText(page, "EMPLOYEE DETAIL REGISTER", PAGE_WIDTH - MARGIN, 192, 6.1, COLORS.muted);
    drawMainTableHeader(page, 207);

    const offset = pageIndex * MAIN_ROWS_PER_PAGE;
    const pageRows = rows.slice(offset, offset + MAIN_ROWS_PER_PAGE);

    if (pageRows.length === 0) {
      drawRect(page, MARGIN, 234, CONTENT_WIDTH, 72, COLORS.rowAlt);
      drawText(page, "No active employee records found in this reporting scope.", MARGIN + 14, 257, 9, COLORS.ink, true);
      drawText(page, "The report is still valid; no employees were returned for the selected date and scope.", MARGIN + 14, 275, 7, COLORS.muted);
    } else {
      pageRows.forEach((row, index) => {
        drawMainRow(page, row, offset + index, 234 + index * MAIN_ROW_HEIGHT, report);
      });
    }

    drawLine(page, MARGIN, FOOTER_Y, PAGE_WIDTH - MARGIN, FOOTER_Y, COLORS.border, 0.6);
    drawText(page, "CONFIDENTIAL - INTERNAL WORKFORCE USE", MARGIN, 576, 6, COLORS.muted, true);

    pages.push(page);
  }

  return pages;
}

function serializePdf(pages: PdfPage[]): Buffer {
  const pageIds = pages.map((_, index) => 5 + index * 2);
  const objectCount = 4 + pages.length * 2;
  const objects: string[] = new Array(objectCount + 1).fill("");

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const content = page.content.join("\n");
    const length = Buffer.byteLength(content, "ascii");

    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${length} >>\nstream\n${content}\nendstream`;
  });

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%HRMS\n", "ascii")];
  const offsets: number[] = [0];
  let byteOffset = chunks[0].length;

  for (let id = 1; id <= objectCount; id += 1) {
    offsets[id] = byteOffset;
    const objectChunk = Buffer.from(`${id} 0 obj\n${objects[id]}\nendobj\n`, "ascii");
    chunks.push(objectChunk);
    byteOffset += objectChunk.length;
  }

  const xrefOffset = byteOffset;
  let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objectCount; id += 1) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }

  xref += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "ascii"));
  return Buffer.concat(chunks);
}

export function createDailyAttendancePdf(report: DailyAttendanceReport): Buffer {
  const mainPages = drawMainPages(report);
  const pages = mainPages;

  pages.forEach((page, index) => {
    page.content.push(
      `BT /F1 6 Tf ${color(COLORS.muted)} rg 1 0 0 1 ${fmt(PAGE_WIDTH - MARGIN - 66)} ${fmt(PAGE_HEIGHT - 576 - 6)} Tm (${escapePdf(`Page ${index + 1} of ${pages.length}`)}) Tj ET`,
    );
  });

  return serializePdf(pages);
}
