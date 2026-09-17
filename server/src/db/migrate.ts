import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import mysql from "mysql2/promise";

import { config } from "../config.js";

const migrationsDirectory = fileURLToPath(new URL("../../migrations", import.meta.url));
const connection = await mysql.createConnection({
  host: config.MYSQL_HOST,
  port: config.MYSQL_PORT,
  database: config.MYSQL_DATABASE,
  user: config.MYSQL_USER,
  password: config.MYSQL_PASSWORD,
  multipleStatements: true,
});

try {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(100) PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB
  `);

  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT version FROM schema_migrations WHERE version = ?",
      [file],
    );
    if (rows.length > 0) continue;

    const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
    await connection.beginTransaction();
    try {
      await connection.query(sql);
      await connection.query("INSERT INTO schema_migrations (version) VALUES (?)", [file]);
      await connection.commit();
      process.stdout.write(`Applied ${file}\n`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }
} finally {
  await connection.end();
}
