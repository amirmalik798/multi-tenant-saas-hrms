import type { PoolClient } from "pg";

import { pool } from "../db";

/**
 * Runs dashboard reads against one consistent, read-only database snapshot.
 *
 * All management dashboard aggregations should use this helper so that cards,
 * charts, and tables built from the same request do not observe different
 * database states. The helper always releases its client and rolls back on
 * failure without masking the original error.
 */
export async function withManagementDashboardSnapshot<T>(
  read: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    transactionStarted = true;

    const result = await read(client);

    await client.query("COMMIT");
    transactionStarted = false;

    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original read/transaction error.
      }
    }

    throw error;
  } finally {
    client.release();
  }
}
