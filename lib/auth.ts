import "server-only";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

import { batch, execute, select, selectOne, type SqlValue } from "./db";

const COOKIE_NAME = "sahamsignal_session";
const SESSION_DAYS = 7;
const BCRYPT_ROUNDS = 12;

export type Role = "user" | "admin";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: number;
  last_login_at: number | null;
}

/**
 * AUTH_SECRET is required in production. In development we fall back to a
 * per-process random secret so the app boots without setup, while logging a
 * warning that sessions will not survive a restart.
 */
function authSecret(): Uint8Array {
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv && fromEnv.length > 0) return new TextEncoder().encode(fromEnv);

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is required in production. Generate one with: openssl rand -base64 32",
    );
  }

  const globalForDev = globalThis as unknown as { __devAuthSecret?: string };
  if (!globalForDev.__devAuthSecret) {
    globalForDev.__devAuthSecret = randomBytes(32).toString("base64");
    console.warn(
      "[auth] AUTH_SECRET not set - using an ephemeral development secret. " +
        "Sessions reset on restart. Set AUTH_SECRET in .env.local to fix.",
    );
  }
  return new TextEncoder().encode(globalForDev.__devAuthSecret);
}

function expiry(): Date {
  return new Date(Date.now() + SESSION_DAYS * 86400_000);
}

function toSessionUser(row: UserRow): SessionUser {
  return { id: row.id, name: row.name, email: row.email, role: row.role === "admin" ? "admin" : "user" };
}

/* -------------------------------------------------------------------------- */
/*                                   Reads                                    */
/* -------------------------------------------------------------------------- */

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const row = await selectOne<UserRow>(
    "SELECT * FROM users WHERE email = ? LIMIT 1",
    [email.toLowerCase().trim()],
  );
  return row ?? null;
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const row = await selectOne<UserRow>("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
  return row ?? null;
}

/**
 * Resolve the current user from the session cookie.
 *
 * This is the single source of truth for auth in pages, layouts and route
 * handlers. Proxy-level checks are only a convenience redirect - never the
 * actual gate.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  let payload: { sub?: string; sid?: string };
  try {
    const { payload: verified } = await jwtVerify(token, authSecret(), {
      issuer: "sahamsignal",
      audience: "sahamsignal-web",
    });
    payload = verified as { sub?: string; sid?: string };
  } catch {
    return null;
  }

  if (!payload.sub || !payload.sid) return null;

  // Sessions are revocable: the row must still exist and not be expired.
  const session = await selectOne<{ id: string; expires_at: number }>(
    "SELECT id, expires_at FROM sessions WHERE id = ? LIMIT 1",
    [payload.sid],
  );
  if (!session || session.expires_at < Date.now()) return null;

  const user = await getUserById(payload.sub);
  if (!user) return null;

  return toSessionUser(user);
}

/** Throw a 401-shaped error if there is no valid session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Anda harus masuk terlebih dahulu.", 401);
  return user;
}

/* -------------------------------------------------------------------------- */
/*                                  Mutations                                  */
/* -------------------------------------------------------------------------- */

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export async function registerUser(input: RegisterInput): Promise<SessionUser> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (name.length < 2) throw new AuthError("Nama minimal 2 karakter.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new AuthError("Format email tidak valid.");
  if (input.password.length < 8) throw new AuthError("Password minimal 8 karakter.");

  if (await findUserByEmail(email)) {
    throw new AuthError("Email sudah terdaftar. Silakan masuk.", 409);
  }

  const id = randomUUID();
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  await execute(
    `INSERT INTO users (id, name, email, password_hash, role, created_at)
     VALUES (?, ?, ?, ?, 'user', ?)`,
    [id, name, email, passwordHash, Date.now()],
  );

  await startSession(id);
  return { id, name, email, role: "user" };
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<{ ok: true; user: UserRow } | { ok: false; reason: string }> {
  const user = await findUserByEmail(email);

  // Always run a hash comparison so response timing does not reveal
  // whether an email exists.
  const hash = user?.password_hash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu";
  const matches = await bcrypt.compare(password, hash);

  if (!user || !matches) return { ok: false, reason: "Email atau password salah." };
  return { ok: true, user };
}

export async function loginUser(email: string, password: string): Promise<SessionUser> {
  const result = await verifyCredentials(email, password);
  if (!result.ok) throw new AuthError(result.reason, 401);

  await startSession(result.user.id);
  await execute("UPDATE users SET last_login_at = ? WHERE id = ?", [Date.now(), result.user.id]);
  return toSessionUser(result.user);
}

async function startSession(userId: string): Promise<void> {
  const sid = randomUUID();
  const exp = expiry();

  await execute(
    "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    [sid, userId, exp.getTime(), Date.now()],
  );

  const token = await new SignJWT({ sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer("sahamsignal")
    .setAudience("sahamsignal-web")
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(authSecret());

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: exp,
  });
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, authSecret(), {
        issuer: "sahamsignal",
        audience: "sahamsignal-web",
      });
      const sid = (payload as { sid?: string }).sid;
      if (sid) await execute("DELETE FROM sessions WHERE id = ?", [sid]);
    } catch {
      // Token was invalid/expired - nothing to revoke.
    }
  }

  store.delete(COOKIE_NAME);
}

/** Remove expired sessions. Cheap housekeeping. */
export async function pruneSessions(): Promise<void> {
  await execute("DELETE FROM sessions WHERE expires_at < ?", [Date.now()]);
}

/** Server Action: update the signed-in user's display name / password. */
export async function updateProfile(
  userId: string,
  patch: { name?: string; currentPassword?: string; newPassword?: string },
): Promise<void> {
  const user = await getUserById(userId);
  if (!user) throw new AuthError("Pengguna tidak ditemukan.", 404);

  const statements: Array<{ sql: string; args: SqlValue[] }> = [];

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length < 2) throw new AuthError("Nama minimal 2 karakter.");
    statements.push({ sql: "UPDATE users SET name = ? WHERE id = ?", args: [name, userId] });
  }

  if (patch.newPassword) {
    const current = patch.currentPassword ?? "";
    const ok = await bcrypt.compare(current, user.password_hash);
    if (!ok) throw new AuthError("Password saat ini salah.", 401);
    if (patch.newPassword.length < 8) throw new AuthError("Password baru minimal 8 karakter.");
    const hash = await bcrypt.hash(patch.newPassword, BCRYPT_ROUNDS);

    // Changing a password invalidates every existing session.
    statements.push({ sql: "UPDATE users SET password_hash = ? WHERE id = ?", args: [hash, userId] });
    statements.push({ sql: "DELETE FROM sessions WHERE user_id = ?", args: [userId] });
  }

  if (statements.length > 0) await batch(statements);
}

export async function countUsers(): Promise<number> {
  const rows = await select<{ n: number }>("SELECT COUNT(*) AS n FROM users");
  return Number(rows[0]?.n ?? 0);
}
