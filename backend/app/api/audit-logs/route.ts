import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { pool } from "../../../lib/db";
import { getPlatformSuperAdmin } from "../../../lib/auth";

const MAX_PAGE_SIZE = 100;
const PLATFORM_WIDE_FILTER = "__PLATFORM__";

function parsePositiveInteger(
  value: string | null,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function parseDateOnly(value: string | null) {
  if (!value) return { value: null as string | null, invalid: false };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { value: null, invalid: true };
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    return { value: null, invalid: true };
  }

  return { value, invalid: false };
}

export async function GET(request: Request) {
  try {
    const admin = await getPlatformSuperAdmin();
    if (!admin) {
      return NextResponse.json(
        { status: "error", message: "Authentication required" },
        { status: 401 },
      );
    }

    const searchParams = new URL(request.url).searchParams;
    const page = parsePositiveInteger(searchParams.get("page"), 1, 1_000_000);
    const pageSize = parsePositiveInteger(
      searchParams.get("pageSize"),
      25,
      MAX_PAGE_SIZE,
    );
    const action = (searchParams.get("action") ?? "").trim().slice(0, 120);
    const query = (searchParams.get("q") ?? "").trim().slice(0, 200);
    const targetType = (searchParams.get("targetType") ?? "").trim().slice(0, 80);
    const actorEmail = (searchParams.get("actorEmail") ?? "").trim().slice(0, 254);
    const targetId = (searchParams.get("targetId") ?? "").trim().slice(0, 120);
    const organizationId = (searchParams.get("organizationId") ?? "").trim().slice(0, 120);
    const fromDateResult = parseDateOnly(searchParams.get("fromDate"));
    const toDateResult = parseDateOnly(searchParams.get("toDate"));
    const includeFilters = searchParams.get("includeFilters") === "1";

    if (fromDateResult.invalid || toDateResult.invalid) {
      return NextResponse.json(
        { status: "error", message: "Use valid dates in YYYY-MM-DD format." },
        { status: 400 },
      );
    }

    const fromDate = fromDateResult.value;
    const toDate = toDateResult.value;
    if (fromDate && toDate && fromDate > toDate) {
      return NextResponse.json(
        { status: "error", message: "The start date must be on or before the end date." },
        { status: 400 },
      );
    }

    const values: unknown[] = [];
    const predicates: string[] = [];

    if (action) {
      values.push(action);
      predicates.push(`a.action_key = $${values.length}`);
    }

    if (targetType) {
      values.push(targetType);
      predicates.push(`a.target_type = $${values.length}`);
    }

    if (actorEmail) {
      values.push(`%${actorEmail.replace(/[\\%_]/g, "\\$&")}%`);
      predicates.push(`a.actor_email ILIKE $${values.length} ESCAPE '\\'`);
    }

    if (targetId) {
      values.push(`%${targetId.replace(/[\\%_]/g, "\\$&")}%`);
      predicates.push(`COALESCE(a.target_id::text, '') ILIKE $${values.length} ESCAPE '\\'`);
    }

    if (organizationId === PLATFORM_WIDE_FILTER) {
      predicates.push("a.organization_id IS NULL");
    } else if (organizationId) {
      values.push(organizationId);
      predicates.push(`a.organization_id::text = $${values.length}`);
    }

    if (fromDate) {
      values.push(fromDate);
      predicates.push(`a.created_at >= $${values.length}::date`);
    }

    if (toDate) {
      values.push(toDate);
      predicates.push(`a.created_at < ($${values.length}::date + INTERVAL '1 day')`);
    }

    if (query) {
      values.push(`%${query.replace(/[\\%_]/g, "\\$&")}%`);
      const index = values.length;
      predicates.push(`(
        a.actor_email ILIKE $${index} ESCAPE '\\'
        OR a.action_key ILIKE $${index} ESCAPE '\\'
        OR a.target_type ILIKE $${index} ESCAPE '\\'
        OR COALESCE(a.reason, '') ILIKE $${index} ESCAPE '\\'
        OR COALESCE(a.target_id::text, '') ILIKE $${index} ESCAPE '\\'
        OR COALESCE(a.organization_id::text, '') ILIKE $${index} ESCAPE '\\'
        OR COALESCE(o.name, '') ILIKE $${index} ESCAPE '\\'
      )`);
    }

    const whereSql = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";

    const countPromise = pool.query(
      `SELECT COUNT(*)::int AS total
       FROM public.platform_audit_logs a
       LEFT JOIN public.organizations o ON o.id = a.organization_id
       ${whereSql}`,
      values,
    );

    const filterOptionsPromise = includeFilters
      ? Promise.all([
          pool.query(
            `SELECT DISTINCT action_key AS value
             FROM public.platform_audit_logs
             WHERE action_key IS NOT NULL AND action_key <> ''
             ORDER BY action_key ASC`,
          ),
          pool.query(
            `SELECT DISTINCT target_type AS value
             FROM public.platform_audit_logs
             WHERE target_type IS NOT NULL AND target_type <> ''
             ORDER BY target_type ASC`,
          ),
          pool.query(
            `SELECT DISTINCT a.organization_id::text AS id,
                    COALESCE(o.name, 'Organization unavailable') AS name
             FROM public.platform_audit_logs a
             LEFT JOIN public.organizations o ON o.id = a.organization_id
             WHERE a.organization_id IS NOT NULL
             ORDER BY name ASC`,
          ),
        ])
      : Promise.resolve(null);

    const [countResult, filterResults] = await Promise.all([
      countPromise,
      filterOptionsPromise,
    ]);

    const total = Number(countResult.rows[0]?.total ?? 0);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pageCount);
    const safeOffset = (safePage - 1) * pageSize;
    const listValues = [...values, pageSize, safeOffset];
    const limitIndex = values.length + 1;
    const offsetIndex = values.length + 2;

    const listResult = await pool.query(
      `SELECT
         a.id,
         a.actor_user_id AS "actorUserId",
         a.actor_email AS "actorEmail",
         a.action_key AS "actionKey",
         a.target_type AS "targetType",
         a.target_id AS "targetId",
         a.organization_id AS "organizationId",
         o.name AS "organizationName",
         a.reason,
         a.before_state AS "beforeState",
         a.after_state AS "afterState",
         a.metadata,
         a.created_at AS "createdAt"
       FROM public.platform_audit_logs a
       LEFT JOIN public.organizations o ON o.id = a.organization_id
       ${whereSql}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      listValues,
    );

    const filterOptions = filterResults
      ? {
          actions: filterResults[0].rows.map((row) => String(row.value)),
          targetTypes: filterResults[1].rows.map((row) => String(row.value)),
          organizations: filterResults[2].rows.map((row) => ({
            id: String(row.id),
            name: String(row.name),
          })),
          platformWideValue: PLATFORM_WIDE_FILTER,
        }
      : undefined;

    return NextResponse.json({
      status: "ok",
      logs: listResult.rows,
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages: pageCount,
      },
      ...(filterOptions ? { filterOptions } : {}),
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error("Platform audit logs error:", error);
    return NextResponse.json(
      { status: "error", message: "Unable to load platform audit logs" },
      { status: 500 },
    );
  }
}
