import { randomBytes } from "node:crypto";

import { passwordSchema } from "@xiaomi-car/contracts";
import { hash } from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";

import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { TotpService } from "../services/auth/totp.service.js";

const inputSchema = z.object({
  username: z.string().regex(/^[A-Za-z0-9._-]{3,80}$/u),
  email: z.string().email().max(120),
  displayName: z.string().trim().min(1).max(80),
  password: passwordSchema,
});

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function base32(input: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const byte of input) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let offset = 0; offset < bits.length; offset += 5) {
    const character = alphabet.at(
      Number.parseInt(bits.slice(offset, offset + 5).padEnd(5, "0"), 2),
    );
    if (!character) throw new Error("Failed to encode TOTP secret");
    output += character;
  }
  return output;
}

const input = inputSchema.parse({
  username: argument("username"),
  email: argument("email"),
  displayName: argument("display-name"),
  password: process.env.ADMIN_BOOTSTRAP_PASSWORD,
});
const secret = base32(randomBytes(20));
const encryptedSecret = new TotpService({
  encryptionKey: config.ADMIN_MFA_ENCRYPTION_KEY,
}).encryptSecret(secret);
const connection = await pool.getConnection();

try {
  await connection.beginTransaction();
  const [existing] = await connection.query<RowDataPacket[]>(
    "SELECT id FROM admin_users LIMIT 1 FOR UPDATE",
  );
  if (existing.length > 0) {
    throw new Error("A bootstrap administrator already exists");
  }
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO admin_users
     (username, email, password_hash, display_name, mfa_secret_encrypted)
     VALUES (?, ?, ?, ?, ?)`,
    [
      input.username,
      input.email,
      await hash(input.password, 12),
      input.displayName,
      encryptedSecret,
    ],
  );
  const [assignment] = await connection.execute<ResultSetHeader>(
    `INSERT INTO admin_user_roles (admin_user_id, role_id)
     SELECT ?, id FROM roles WHERE code = 'super_admin'`,
    [result.insertId],
  );
  if (assignment.affectedRows !== 1) {
    throw new Error("Run db:seed before creating the super administrator");
  }
  await connection.commit();

  const label = encodeURIComponent(`Xiaomi Car Admin:${input.username}`);
  const issuer = encodeURIComponent("Xiaomi Car Admin");
  process.stdout.write(
    [
      "Super administrator created.",
      "Store this TOTP setup URI securely; it will not be shown again:",
      `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
      "",
    ].join("\n"),
  );
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await pool.end();
}
