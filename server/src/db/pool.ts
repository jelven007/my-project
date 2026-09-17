import mysql from "mysql2/promise";

import { config } from "../config.js";

export const pool = mysql.createPool({
  host: config.MYSQL_HOST,
  port: config.MYSQL_PORT,
  database: config.MYSQL_DATABASE,
  user: config.MYSQL_USER,
  password: config.MYSQL_PASSWORD,
  connectionLimit: config.MYSQL_CONNECTION_LIMIT,
  enableKeepAlive: true,
  decimalNumbers: true,
  timezone: "Z",
});

export async function probeDatabase(): Promise<void> {
  await pool.query("SELECT 1");
}
