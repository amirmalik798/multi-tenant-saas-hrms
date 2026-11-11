/**
 * Pure attendance-duration calculations shared by attendance reports.
 * All timestamps must be ISO strings or Date values that include an absolute
 * instant (the database returns timestamptz values for attendance events).
 */
export type AttendanceCalculationEvent = {
  id?: string;
  eventType?: string | null;
  recordedAt?: string | Date | null;
};

export type AttendanceCalculationInput = {
  events: AttendanceCalculationEvent[] | null | undefined;
  expectedStart: string | Date | null | undefined;
  expectedEnd: string | Date | null | undefined;
  scheduledBreakMinutes: number | string | null | undefined;
  approvedOvertimeMinutes: number | string | null | undefined;
  asOf?: Date;
};

export type AttendanceCalculationResult = {
  calculationStatus: "COMPLETE" | "IN_PROGRESS" | "REVIEW_REQUIRED" | "NO_RECORDS" | "NO_SHIFT";
  actualElapsedMinutes: number;
  breakDeductedMinutes: number;
  workedMinutes: number;
  regularWorkedMinutes: number;
  potentialOvertimeMinutes: number;
  approvedOvertimeMinutes: number;
  payableOvertimeMinutes: number;
  excessUnapprovedOvertimeMinutes: number;
  openSession: boolean;
  invalidSequence: boolean;
};

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function toNonNegativeInteger(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function minutesBetween(start: number, end: number): number {
  return Math.max(0, Math.floor((end - start) / 60_000));
}

/**
 * Calculates time from ordered clock pairs. With a single continuous clock-in/out
 * interval, deduct the scheduled unpaid break when the recorded interval overlaps
 * enough of the assigned shift to reasonably include that break, even if the
 * employee arrives late or leaves early. Separate clock pairs already exclude
 * time away from work. Overtime means time worked after the scheduled shift end;
 * only approved pre-authorized minutes are considered payable.
 */
export function calculateDailyAttendance(
  input: AttendanceCalculationInput,
): AttendanceCalculationResult {
  const events = Array.isArray(input.events) ? [...input.events] : [];
  const expectedStart = toDate(input.expectedStart);
  const expectedEnd = toDate(input.expectedEnd);
  const asOf = input.asOf ?? new Date();
  const scheduledBreakMinutes = toNonNegativeInteger(input.scheduledBreakMinutes);
  const approvedMinutes = toNonNegativeInteger(input.approvedOvertimeMinutes);

  events.sort((a, b) => {
    const aTime = toDate(a.recordedAt)?.getTime() ?? 0;
    const bTime = toDate(b.recordedAt)?.getTime() ?? 0;
    return aTime - bTime || String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });

  if (events.length === 0) {
    return {
      calculationStatus: expectedStart && expectedEnd ? "NO_RECORDS" : "NO_SHIFT",
      actualElapsedMinutes: 0,
      breakDeductedMinutes: 0,
      workedMinutes: 0,
      regularWorkedMinutes: 0,
      potentialOvertimeMinutes: 0,
      approvedOvertimeMinutes: approvedMinutes,
      payableOvertimeMinutes: 0,
      excessUnapprovedOvertimeMinutes: 0,
      openSession: false,
      invalidSequence: false,
    };
  }

  let openClockIn: Date | null = null;
  let invalidSequence = false;
  let openSession = false;
  let actualElapsedMinutes = 0;
  let overtimeMinutes = 0;
  let scheduledOverlapMinutes = 0;
  let completedClockIntervals = 0;
  let fullShiftCovered = false;

  for (const event of events) {
    const type = String(event.eventType ?? "").toUpperCase();
    const timestamp = toDate(event.recordedAt);
    if (!timestamp || (type !== "CLOCK_IN" && type !== "CLOCK_OUT")) {
      invalidSequence = true;
      continue;
    }

    if (type === "CLOCK_IN") {
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

    const startMs = openClockIn.getTime();
    const endMs = timestamp.getTime();
    if (endMs <= startMs) {
      invalidSequence = true;
      openClockIn = null;
      continue;
    }

    actualElapsedMinutes += minutesBetween(startMs, endMs);
    completedClockIntervals += 1;
    if (expectedStart && expectedEnd) {
      const expectedStartMs = expectedStart.getTime();
      const expectedEndMs = expectedEnd.getTime();
      const overlapStart = Math.max(startMs, expectedStartMs);
      const overlapEnd = Math.min(endMs, expectedEndMs);
      if (overlapEnd > overlapStart) {
        scheduledOverlapMinutes += minutesBetween(overlapStart, overlapEnd);
      }
      if (endMs > expectedEndMs) {
        overtimeMinutes += minutesBetween(Math.max(startMs, expectedEndMs), endMs);
      }
    }
    openClockIn = null;
  }

  if (openClockIn) {
    openSession = true;
    const startMs = openClockIn.getTime();
    const endMs = asOf.getTime();
    if (endMs > startMs) {
      actualElapsedMinutes += minutesBetween(startMs, endMs);
      if (expectedStart && expectedEnd) {
        const overlapStart = Math.max(startMs, expectedStart.getTime());
        const overlapEnd = Math.min(endMs, expectedEnd.getTime());
        if (overlapEnd > overlapStart) {
          scheduledOverlapMinutes += minutesBetween(overlapStart, overlapEnd);
        }
      }
      if (expectedEnd && endMs > expectedEnd.getTime()) {
        overtimeMinutes += minutesBetween(Math.max(startMs, expectedEnd.getTime()), endMs);
      }
    }
  }

  if (expectedStart && expectedEnd) {
    const scheduledSpanMinutes = minutesBetween(
      expectedStart.getTime(),
      expectedEnd.getTime(),
    );
    fullShiftCovered = scheduledOverlapMinutes >= Math.max(0, scheduledSpanMinutes - scheduledBreakMinutes);
  }
  // Clock-out/clock-in pairs already exclude time away from work (for
  // example, an unpaid lunch break). Never deduct the scheduled break again
  // when the employee recorded multiple completed work intervals.
  // A scheduled deduction is applied only to a single continuous interval
  // whose scheduled overlap is long enough to include the unpaid break. This
  // still reduces paid hours for late arrivals and early departures.
  const breakDeductedMinutes =
    fullShiftCovered && completedClockIntervals === 1 && !openSession
      ? Math.min(scheduledBreakMinutes, actualElapsedMinutes)
      : 0;
  const workedMinutes = Math.max(0, actualElapsedMinutes - breakDeductedMinutes);
  const potentialOvertimeMinutes = Math.min(workedMinutes, overtimeMinutes);
  const payableOvertimeMinutes = Math.min(potentialOvertimeMinutes, approvedMinutes);
  const excessUnapprovedOvertimeMinutes = Math.max(
    0,
    potentialOvertimeMinutes - payableOvertimeMinutes,
  );
  const regularWorkedMinutes = Math.max(0, workedMinutes - potentialOvertimeMinutes);

  return {
    calculationStatus: invalidSequence
      ? "REVIEW_REQUIRED"
      : openSession
        ? "IN_PROGRESS"
        : "COMPLETE",
    actualElapsedMinutes,
    breakDeductedMinutes,
    workedMinutes,
    regularWorkedMinutes,
    potentialOvertimeMinutes,
    approvedOvertimeMinutes: approvedMinutes,
    payableOvertimeMinutes,
    excessUnapprovedOvertimeMinutes,
    openSession,
    invalidSequence,
  };
}
