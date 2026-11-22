"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Clock3,
  Mail,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { apiRequest, isRecord } from "@/lib/api-client";
import { formatDate, formatNumber } from "@/lib/format";
import { useSmartRefresh } from "@/lib/smart-refresh";
import type { WorkspaceRole } from "@/types/workspace";

import {
  ManagementDashboardEmptyState,
  ManagementDashboardErrorState,
  ManagementDashboardMetricCard,
  ManagementDashboardMetricGrid,
  ManagementDashboardPanel,
  ManagementDashboardSectionHeading,
  ManagementDashboardSkeleton,
} from "./ManagementDashboardPrimitives";

type ManagementRole = Exclude<WorkspaceRole, "EMPLOYEE">;
type QueueStatus = "ready" | "not-applicable" | "unavailable";

type Queue = {
  status: QueueStatus;
  count: number | null;
  href: string | null;
  label: string;
  description: string;
};

type ActionCenterResponse = {
  status: "ok";
  schemaVersion: 1;
  generatedAt: string;
  scope: { roleName: ManagementRole; kind: "ORGANIZATION" | "ASSIGNED_DEPARTMENTS" };
  organization: { name: string; timeZone: string; workDate: string };
  total: number | null;
  queues: {
    invitations: Queue;
    corrections: Queue;
    overtime: Queue;
    leave: Queue;
  };
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ActionCenterResponse };

export type ManagementDashboardActionCenterProps = {
  role?: ManagementRole;
};

const QUEUE_META = [
  { key: "invitations", icon: Mail, tone: "accent" as const },
  { key: "corrections", icon: CalendarClock, tone: "warning" as const },
  { key: "overtime", icon: Clock3, tone: "neutral" as const },
  { key: "leave", icon: ShieldCheck, tone: "success" as const },
] as const;

function isQueue(value: unknown): value is Queue {
  if (!isRecord(value)) return false;
  const status = value.status;
  if (
    status !== "ready" &&
    status !== "not-applicable" &&
    status !== "unavailable"
  ) return false;
  if (typeof value.label !== "string" || typeof value.description !== "string") return false;
  if (status === "ready") {
    return typeof value.count === "number" &&
      Number.isSafeInteger(value.count) && value.count >= 0 &&
      typeof value.href === "string" && value.href.startsWith("/");
  }
  return value.count === null && value.href === null;
}

function isResponse(value: unknown): value is ActionCenterResponse {
  if (!isRecord(value) || value.status !== "ok" || value.schemaVersion !== 1) return false;
  if (!isRecord(value.scope) || !isRecord(value.organization) || !isRecord(value.queues)) return false;
  const role = value.scope.roleName;
  const kind = value.scope.kind;
  if (
    (role !== "ORGANIZATION_ADMIN" && role !== "HR_MANAGER" && role !== "DEPARTMENT_MANAGER") ||
    (kind !== "ORGANIZATION" && kind !== "ASSIGNED_DEPARTMENTS") ||
    typeof value.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    typeof value.organization.timeZone !== "string" ||
    typeof value.organization.workDate !== "string" ||
    !(value.total === null || (typeof value.total === "number" && Number.isSafeInteger(value.total) && value.total >= 0))
  ) return false;
  const keys = ["invitations", "corrections", "overtime", "leave"];
  if (!keys.every((key) => isQueue(value.queues[key]))) return false;
  const hasUnavailable = keys.some((key) => {
    const queue = value.queues[key];
    return isRecord(queue) && queue.status === "unavailable";
  });
  return hasUnavailable ? value.total === null : value.total !== null;
}

export function ManagementDashboardActionCenter({
  role,
}: ManagementDashboardActionCenterProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  const requestSequence = useRef(0);
  const mounted = useRef(false);
  const hasReadySnapshot = useRef(false);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    if (!hasReadySnapshot.current) {
      setState({ status: "loading" });
    }

    try {
      const payload: unknown = await apiRequest("/management-dashboard/action-center");
      if (!isResponse(payload)) throw new Error("The Action Center returned an invalid response.");
      if (role && payload.scope.roleName !== role) {
        throw new Error("The Action Center role does not match the active workspace.");
      }
      if (mounted.current && requestId === requestSequence.current) {
        hasReadySnapshot.current = true;
        setState({ status: "ready", data: payload });
      }
    } catch (error) {
      if (mounted.current && requestId === requestSequence.current) {
        hasReadySnapshot.current = false;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to load management actions.",
        });
      }
    }
  }, [role]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      requestSequence.current += 1;
    };
  }, [load]);

  useSmartRefresh(() => load(), true, 60_000);

  return (
    <section className="md-action-center" aria-label="Management Action Center">
      <ManagementDashboardSectionHeading
        eyebrow="Management action center"
        title="Work that needs your attention"
        description="A live view of pending work you are authorized to review. Open the existing queue to take action."
      />

      {state.status === "loading" ? (
        <ManagementDashboardSkeleton variant="metrics" count={4} columns={4} label="Loading management action queues" />
      ) : state.status === "error" ? (
        <ManagementDashboardErrorState
          title="Action Center unavailable"
          description={state.message}
          action={<Button size="sm" variant="secondary" leading={<RefreshCw size={14} />} onClick={() => void load()}>Try again</Button>}
        />
      ) : (
        <>
          <div className="md-action-center-summary">
            <div>
              <span className="md-action-center-overline">Actionable items</span>
              <strong>{state.data.total === null ? "Unavailable" : formatNumber(state.data.total)}</strong>
              <small>
                {state.data.total === null
                  ? "One or more permitted queues could not be loaded."
                  : "Across the queues available to your role"}
              </small>
            </div>
            <div className="md-action-center-updated">
              <span>Snapshot updated</span>
              <time dateTime={state.data.generatedAt}>
                {formatDate(state.data.generatedAt, state.data.organization.timeZone)}
              </time>
            </div>
          </div>

          <ManagementDashboardMetricGrid columns={4} label="Actionable management queue counts">
            {QUEUE_META.map(({ key, icon, tone }) => {
              const queue = state.data.queues[key];
              const available = queue.status === "ready";
              return (
                <ManagementDashboardMetricCard
                  key={key}
                  label={queue.label}
                  value={
                    available
                      ? formatNumber(queue.count ?? 0)
                      : queue.status === "not-applicable"
                        ? "N/A"
                        : "Unavailable"
                  }
                  description={queue.description}
                  icon={icon}
                  tone={available && (queue.count ?? 0) > 0 ? tone : "neutral"}
                  context={
                    available && queue.href ? (
                      <Link className="md-action-center-link" href={queue.href}>
                        Open queue <ArrowRight size={13} aria-hidden="true" />
                      </Link>
                    ) : queue.status === "not-applicable" ? (
                      <span className="md-action-center-status">Not available for this role</span>
                    ) : (
                      <button className="md-action-center-retry" type="button" onClick={() => void load()}>
                        Retry all queues <RefreshCw size={12} aria-hidden="true" />
                      </button>
                    )
                  }
                />
              );
            })}
          </ManagementDashboardMetricGrid>

          {state.data.total === 0 ? (
            <ManagementDashboardPanel className="md-action-center-empty-panel">
              <ManagementDashboardEmptyState
                title="You are all caught up"
                description="There are no pending actions in the queues currently available to your role."
                icon={ShieldCheck}
              />
            </ManagementDashboardPanel>
          ) : null}
        </>
      )}
    </section>
  );
}
