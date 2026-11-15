import type { PoolClient } from "pg";

type TenantTable = {
  relation_oid: string;
  table_name: string;
  qualified_name: string;
};

type ForeignKey = {
  constraint_name: string;
  child_oid: string;
  parent_oid: string;
  child_table: string;
  parent_table: string;
  join_condition: string;
  delete_action: string;
};

export type OrganizationDeletionReport = {
  deletedRecordCount: number;
  deletedTableCount: number;
  recordsByTable: Record<string, number>;
};

export class OrganizationDeletionBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationDeletionBlockedError";
  }
}

function addCount(
  counts: Record<string, number>,
  tableName: string,
  count: number,
) {
  if (count > 0) {
    counts[tableName] = (counts[tableName] ?? 0) + count;
  }
}

/**
 * Permanently removes rows owned by one organization.
 *
 * The purge plan is derived from PostgreSQL's live catalog instead of relying
 * on a hand-maintained list of HRMS modules. New tenant tables are included
 * automatically. New external dependencies or unsupported cycles stop the
 * operation before COMMIT so the caller can roll the transaction back.
 *
 * Platform audit logs are intentionally retained. The database's existing
 * ON DELETE SET NULL constraints anonymize their organization/user references.
 */
export async function deleteOrganizationTenantData(
  client: PoolClient,
  organizationId: string,
): Promise<OrganizationDeletionReport> {
  // Lock the tenant's existing contract/document rows before evaluating
  // legal holds. This prevents a concurrent transaction from turning an
  // unheld record into a legal hold after the check but before deletion.
  // The organization row is already locked by the caller, so FK-backed new
  // rows cannot be inserted while this purge is in progress.
  await client.query(
    "SELECT 1 FROM public.employee_contracts WHERE organization_id = $1::uuid FOR UPDATE",
    [organizationId],
  );
  await client.query(
    "SELECT 1 FROM public.employee_documents WHERE organization_id = $1::uuid FOR UPDATE",
    [organizationId],
  );

  const legalHoldResult = await client.query<{
    contract_holds: number;
    document_holds: number;
  }>(
    `SELECT
       (SELECT COUNT(*)::integer FROM public.employee_contracts
        WHERE organization_id = $1::uuid AND legal_hold IS TRUE) AS contract_holds,
       (SELECT COUNT(*)::integer FROM public.employee_documents
        WHERE organization_id = $1::uuid AND legal_hold IS TRUE) AS document_holds`,
    [organizationId],
  );
  const contractHolds = Number(legalHoldResult.rows[0]?.contract_holds ?? 0);
  const documentHolds = Number(legalHoldResult.rows[0]?.document_holds ?? 0);
  if (contractHolds > 0 || documentHolds > 0) {
    throw new OrganizationDeletionBlockedError(
      `Deletion is blocked by ${contractHolds + documentHolds} legal-hold record(s). Release the legal holds before deleting this organization.`,
    );
  }

  const tablesSql = [
    "SELECT",
    "  relation_data.oid::text AS relation_oid,",
    "  relation_data.relname AS table_name,",
    "  format('%I.%I', namespace_data.nspname, relation_data.relname) AS qualified_name",
    "FROM pg_class AS relation_data",
    "JOIN pg_namespace AS namespace_data",
    "  ON namespace_data.oid = relation_data.relnamespace",
    "WHERE namespace_data.nspname = 'public'",
    "  AND relation_data.relkind IN ('r', 'p')",
    "  AND EXISTS (",
    "    SELECT 1",
    "    FROM pg_attribute AS organization_column",
    "    WHERE organization_column.attrelid = relation_data.oid",
    "      AND organization_column.attname = 'organization_id'",
    "      AND organization_column.attnum > 0",
    "      AND NOT organization_column.attisdropped",
    "  )",
    "  AND relation_data.relname NOT IN ('organizations', 'platform_audit_logs')",
    "ORDER BY relation_data.relname",
  ].join("\n");
  const tablesResult = await client.query<TenantTable>(tablesSql);
  const tenantTables = tablesResult.rows;

  // Do not silently omit tenant data stored outside the application's
  // supported public schema. Stop before mutation until that schema is
  // explicitly included in the deletion design.
  const nonPublicTenantTablesResult = await client.query<{ qualified_name: string }>(
    [
      "SELECT format('%I.%I', namespace_data.nspname, relation_data.relname) AS qualified_name",
      "FROM pg_class AS relation_data",
      "JOIN pg_namespace AS namespace_data",
      "  ON namespace_data.oid = relation_data.relnamespace",
      "WHERE namespace_data.nspname NOT IN ('public', 'pg_catalog', 'information_schema')",
      "  AND namespace_data.nspname NOT LIKE 'pg_toast%'",
      "  AND relation_data.relkind IN ('r', 'p')",
      "  AND EXISTS (",
      "    SELECT 1 FROM pg_attribute AS organization_column",
      "    WHERE organization_column.attrelid = relation_data.oid",
      "      AND organization_column.attname = 'organization_id'",
      "      AND organization_column.attnum > 0",
      "      AND NOT organization_column.attisdropped",
      "  )",
      "ORDER BY namespace_data.nspname, relation_data.relname",
    ].join("\n"),
  );

  if (nonPublicTenantTablesResult.rows.length > 0) {
    throw new OrganizationDeletionBlockedError(
      "Tenant-scoped tables exist outside the supported public schema: " +
        nonPublicTenantTablesResult.rows.map((row) => row.qualified_name).join(", ") +
        ". Deletion was stopped safely.",
    );
  }

  if (tenantTables.length === 0) {
    throw new OrganizationDeletionBlockedError(
      "No tenant-owned organization tables were found. Deletion was stopped safely.",
    );
  }

  const tableByOid = new Map(
    tenantTables.map((table) => [table.relation_oid, table]),
  );
  const tenantRelationOids = tenantTables.map((table) => table.relation_oid);

  const organizationResult = await client.query<{ relation_oid: string }>(
    "SELECT 'public.organizations'::regclass::oid::text AS relation_oid",
  );
  const organizationRelationOid = organizationResult.rows[0]?.relation_oid;

  if (!organizationRelationOid) {
    throw new OrganizationDeletionBlockedError(
      "The organizations table could not be resolved. Deletion was stopped safely.",
    );
  }

  const foreignKeysSql = [
    "SELECT",
    "  foreign_key.conname AS constraint_name,",
    "  foreign_key.conrelid::text AS child_oid,",
    "  foreign_key.confrelid::text AS parent_oid,",
    "  format('%I.%I', child_namespace.nspname, child_relation.relname) AS child_table,",
    "  format('%I.%I', parent_namespace.nspname, parent_relation.relname) AS parent_table,",
    "  string_agg(",
    "    format('child.%I = parent.%I', child_column.attname, parent_column.attname),",
    "    ' AND ' ORDER BY child_key.ordinality",
    "  ) AS join_condition,",
    "  foreign_key.confdeltype AS delete_action",
    "FROM pg_constraint AS foreign_key",
    "JOIN pg_class AS child_relation",
    "  ON child_relation.oid = foreign_key.conrelid",
    "JOIN pg_namespace AS child_namespace",
    "  ON child_namespace.oid = child_relation.relnamespace",
    "JOIN pg_class AS parent_relation",
    "  ON parent_relation.oid = foreign_key.confrelid",
    "JOIN pg_namespace AS parent_namespace",
    "  ON parent_namespace.oid = parent_relation.relnamespace",
    "JOIN LATERAL unnest(foreign_key.conkey) WITH ORDINALITY",
    "  AS child_key(attnum, ordinality)",
    "  ON TRUE",
    "JOIN LATERAL unnest(foreign_key.confkey) WITH ORDINALITY",
    "  AS parent_key(attnum, ordinality)",
    "  ON parent_key.ordinality = child_key.ordinality",
    "JOIN pg_attribute AS child_column",
    "  ON child_column.attrelid = foreign_key.conrelid",
    " AND child_column.attnum = child_key.attnum",
    "JOIN pg_attribute AS parent_column",
    "  ON parent_column.attrelid = foreign_key.confrelid",
    " AND parent_column.attnum = parent_key.attnum",
    "WHERE foreign_key.contype = 'f'",
    "  AND child_namespace.nspname NOT IN ('pg_catalog', 'information_schema')",
    "  AND child_namespace.nspname NOT LIKE 'pg_toast%'",
    "  AND parent_namespace.nspname = 'public'",
    "  AND child_relation.relkind IN ('r', 'p')",
    "  AND parent_relation.relkind IN ('r', 'p')",
    "GROUP BY",
    "  foreign_key.oid, foreign_key.conname, foreign_key.conrelid, foreign_key.confrelid,",
    "  child_namespace.nspname, child_relation.relname,",
    "  parent_namespace.nspname, parent_relation.relname, foreign_key.confdeltype",
    "ORDER BY child_namespace.nspname, child_relation.relname, foreign_key.conname",
  ].join("\n");
  const foreignKeysResult = await client.query<ForeignKey>(foreignKeysSql);
  const foreignKeys = foreignKeysResult.rows;

  // Current external dependencies are deliberately narrow:
  // password_reset_tokens -> users (CASCADE);
  // role_permissions -> organization roles (CASCADE);
  // platform_audit_logs -> organizations/users (SET NULL).
  const externalDependencies = foreignKeys.filter(
    (foreignKey) =>
      (tableByOid.has(foreignKey.parent_oid) ||
        foreignKey.parent_oid === organizationRelationOid) &&
      !tableByOid.has(foreignKey.child_oid),
  );

  const cascadeChildCounts: Record<string, number> = {};
  for (const dependency of externalDependencies) {
    if (
      dependency.child_table === "public.platform_audit_logs" &&
      dependency.delete_action === "n"
    ) {
      continue;
    }

    if (
      dependency.delete_action !== "c" ||
      ![
        "public.password_reset_tokens",
        "public.role_permissions",
      ].includes(dependency.child_table)
    ) {
      throw new OrganizationDeletionBlockedError(
        "The database contains a new or unsupported cross-table dependency (" +
          dependency.child_table +
          " -> " +
          dependency.parent_table +
          "). No organization data was deleted.",
      );
    }

    const countSql =
      "SELECT COUNT(*)::text AS count FROM " +
      dependency.child_table +
      " AS child JOIN " +
      dependency.parent_table +
      " AS parent ON " +
      dependency.join_condition +
      " WHERE parent.organization_id = $1::uuid";
    const countResult = await client.query<{ count: string }>(
      countSql,
      [organizationId],
    );

    addCount(
      cascadeChildCounts,
      dependency.child_table,
      Number(countResult.rows[0]?.count ?? 0),
    );
  }

  // Set the transaction-scoped purge context before any updates so deferred
  // hierarchy guards can safely skip checks for rows being removed wholesale.
  await client.query("SET LOCAL app.organization_deletion = 'on'");

  // The current schema has one intentional table cycle: employees <-> departments.
  // Break those references before deriving the table deletion order. Deferred
  // hierarchy triggers will see no row at commit because these tables are
  // removed by this same transaction.
  await client.query(
    "UPDATE public.departments SET manager_id = NULL " +
      "WHERE organization_id = $1::uuid AND manager_id IS NOT NULL",
    [organizationId],
  );

  // Document versions can reference an earlier document in the same tenant.
  // This FK is ON DELETE RESTRICT, so clear the self-reference before the
  // whole tenant document set is removed.
  await client.query(
    "UPDATE public.employee_documents SET supersedes_document_id = NULL " +
      "WHERE organization_id = $1::uuid AND supersedes_document_id IS NOT NULL",
    [organizationId],
  );

  await client.query(
    "UPDATE public.employees " +
      "SET department_id = NULL " +
      "WHERE organization_id = $1::uuid AND department_id IS NOT NULL",
    [organizationId],
  );

  // Employee history remains append-only in normal workflows. The migration
  // lets its trigger permit DELETE only in this transaction-scoped purge.
  // Child tables must be deleted before the rows they reference.
  const outgoing = new Map<string, Set<string>>();
  const incomingCount = new Map<string, number>();

  for (const relationOid of tenantRelationOids) {
    outgoing.set(relationOid, new Set());
    incomingCount.set(relationOid, 0);
  }

  const detachedConstraints = new Set([
    "fk_departments_manager_same_org",
    "fk_employees_department_same_org",
  ]);

  for (const foreignKey of foreignKeys) {
    if (
      !tableByOid.has(foreignKey.child_oid) ||
      !tableByOid.has(foreignKey.parent_oid) ||
      foreignKey.child_oid === foreignKey.parent_oid ||
      detachedConstraints.has(foreignKey.constraint_name)
    ) {
      continue;
    }

    const parents = outgoing.get(foreignKey.child_oid);
    if (!parents || parents.has(foreignKey.parent_oid)) continue;

    parents.add(foreignKey.parent_oid);
    incomingCount.set(
      foreignKey.parent_oid,
      (incomingCount.get(foreignKey.parent_oid) ?? 0) + 1,
    );
  }

  const compareTableNames = (left: string, right: string) =>
    (tableByOid.get(left)?.table_name ?? left).localeCompare(
      tableByOid.get(right)?.table_name ?? right,
    );

  const ready = tenantRelationOids
    .filter((relationOid) => incomingCount.get(relationOid) === 0)
    .sort(compareTableNames);

  const deleteOrder: string[] = [];
  while (ready.length > 0) {
    const relationOid = ready.shift();
    if (!relationOid) continue;

    deleteOrder.push(relationOid);

    const parents = [...(outgoing.get(relationOid) ?? [])].sort(
      compareTableNames,
    );

    for (const parentOid of parents) {
      const nextCount = (incomingCount.get(parentOid) ?? 0) - 1;
      incomingCount.set(parentOid, nextCount);

      if (nextCount === 0) {
        ready.push(parentOid);
        ready.sort(compareTableNames);
      }
    }
  }

  if (deleteOrder.length !== tenantRelationOids.length) {
    const unresolvedTables = tenantRelationOids
      .filter((relationOid) => !deleteOrder.includes(relationOid))
      .map((relationOid) => tableByOid.get(relationOid)?.table_name ?? relationOid);

    throw new OrganizationDeletionBlockedError(
      "The tenant schema contains an unsupported foreign-key cycle involving " +
        unresolvedTables.join(", ") +
        ". No organization data was deleted.",
    );
  }

  const recordsByTable: Record<string, number> = {};
  let deletedRecordCount = 0;

  for (const [tableName, count] of Object.entries(cascadeChildCounts)) {
    addCount(recordsByTable, tableName, count);
    deletedRecordCount += count;
  }

  for (const relationOid of deleteOrder) {
    const table = tableByOid.get(relationOid);
    if (!table) {
      throw new OrganizationDeletionBlockedError(
        "A tenant table disappeared while the deletion plan was being built. No data was deleted.",
      );
    }

    const result = await client.query(
      "DELETE FROM " +
        table.qualified_name +
        " WHERE organization_id = $1::uuid",
      [organizationId],
    );

    const deletedCount = result.rowCount ?? 0;
    addCount(recordsByTable, table.table_name, deletedCount);
    deletedRecordCount += deletedCount;
  }

  return {
    deletedRecordCount,
    deletedTableCount: Object.keys(recordsByTable).length,
    recordsByTable,
  };
}
