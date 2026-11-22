export type AttendanceClockBlockReason =
  | "STATUS_UNKNOWN"
  | "APPROVED_LEAVE"
  | "PUBLIC_HOLIDAY"
  | "NO_SHIFT"
  | "INVALID_SHIFT"
  | "BEFORE_SHIFT"
  | "SHIFT_ENDED"
  | null;

export interface AttendanceClockEligibilityInput {
  status?: string | null;
  expectedStart?: string | null;
  expectedEnd?: string | null;
  approvedLeave?: boolean;
  publicHoliday?: boolean;
  now?: number;
}

export interface AttendanceClockEligibility {
  canClockIn: boolean;
  canClockOut: boolean;
  isClockedIn: boolean;
  blockReason: AttendanceClockBlockReason;
  shiftStartAt: number | null;
  shiftEndAt: number | null;
  minutesUntilShift: number;
}

export function getAttendanceClockEligibility(
  input: AttendanceClockEligibilityInput,
): AttendanceClockEligibility {
  const now = input.now ?? Date.now();
  const isClockedIn = input.status === "CLOCKED_IN";
  const statusKnown = isClockedIn || input.status === "CLOCKED_OUT";
  const shiftStartAt = input.expectedStart ? Date.parse(input.expectedStart) : null;
  const shiftEndAt = input.expectedEnd ? Date.parse(input.expectedEnd) : null;

  if (isClockedIn) {
    return {
      canClockIn: false,
      canClockOut: true,
      isClockedIn: true,
      blockReason: null,
      shiftStartAt: Number.isFinite(shiftStartAt) ? shiftStartAt : null,
      shiftEndAt: Number.isFinite(shiftEndAt) ? shiftEndAt : null,
      minutesUntilShift: 0,
    };
  }

  let blockReason: AttendanceClockBlockReason = null;
  if (!statusKnown) blockReason = "STATUS_UNKNOWN";
  else if (input.approvedLeave) blockReason = "APPROVED_LEAVE";
  else if (input.publicHoliday) blockReason = "PUBLIC_HOLIDAY";
  else if (!input.expectedStart || !input.expectedEnd) blockReason = "NO_SHIFT";
  else if (
    !Number.isFinite(shiftStartAt) ||
    !Number.isFinite(shiftEndAt) ||
    (shiftStartAt as number) >= (shiftEndAt as number)
  ) blockReason = "INVALID_SHIFT";
  else if (now < (shiftStartAt as number)) blockReason = "BEFORE_SHIFT";
  else if (now >= (shiftEndAt as number)) blockReason = "SHIFT_ENDED";

  return {
    canClockIn: blockReason === null,
    canClockOut: false,
    isClockedIn: false,
    blockReason,
    shiftStartAt: Number.isFinite(shiftStartAt) ? shiftStartAt : null,
    shiftEndAt: Number.isFinite(shiftEndAt) ? shiftEndAt : null,
    minutesUntilShift: blockReason === "BEFORE_SHIFT"
      ? Math.max(0, Math.ceil(((shiftStartAt as number) - now) / 60000))
      : 0,
  };
}
