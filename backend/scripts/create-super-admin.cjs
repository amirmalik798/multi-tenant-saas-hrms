
const process = require("node:process");
const crypto = require("node:crypto");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

try {
  process.loadEnvFile(".env.local");
} catch {
  console.error(
    "Could not load .env.local. Run this script from the backend folder."
  );
  process.exit(1);
}

const requiredVariables = [
  "DB_HOST",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
];

const missingVariables = requiredVariables.filter(
  (name) => !process.env[name]
);

if (missingVariables.length > 0) {
  console.error(
    `Missing database configuration: ${missingVariables.join(", ")}`
  );
  process.exit(1);
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 5000,
});

async function main() {
  const email = "amir.malik.798am@gmail.com";
  const client = await pool.connect();

  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Find the existing platform Super Admin role.
    const roleResult = await client.query(
      `SELECT id
       FROM roles
       WHERE name = $1
         AND scope = $2
         AND organization_id IS NULL`,
      ["SUPER_ADMIN", "PLATFORM"]
    );

    if (roleResult.rowCount !== 1) {
      throw new Error(
        "Expected exactly one platform SUPER_ADMIN role."
      );
    }

    // Never overwrite an existing account.
    const existingUser = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rowCount > 0) {
      throw new Error(
        "This email already has an account. No changes were made."
      );
    }

    // Generate a strong password locally.
    const initialPassword = crypto
      .randomBytes(24)
      .toString("base64url");

    // Store only the bcrypt hash in PostgreSQL.
    const passwordHash = await bcrypt.hash(initialPassword, 12);

    const result = await client.query(
      `INSERT INTO users (
         email,
         password_hash,
         account_scope,
         organization_id,
         employee_id,
         status,
         role_id
       )
       VALUES ($1, $2, 'PLATFORM', NULL, NULL, 'ACTIVE', $3)
       RETURNING id, email, account_scope, status, role_id`,
      [email, passwordHash, roleResult.rows[0].id]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    console.log("\nSuper Admin account created successfully.");
    console.log("Account:", result.rows[0]);
    console.log("\nINITIAL PASSWORD:");
    console.log(initialPassword);
    console.log(
      "\nSave this password in a password manager. Do not share it or commit it to source control."
    );
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error("Bootstrap failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
