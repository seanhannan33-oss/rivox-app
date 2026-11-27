// Postgres-backed storage. Survives restarts, unlike MemoryStore.
import pg from "pg";
import type { Access } from "./access.ts";
import type { StoredCode } from "./codes.ts";
import type { Member, Store } from "./store.ts";

/** The slice of pg.Pool this store uses, so tests can pass a real pool or a stand-in. */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 5 });
}

export class PostgresStore implements Store {
  constructor(private readonly db: Queryable) {}

  /** Safe to run on every start. */
  async migrate(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS sign_in_codes (
        email      text PRIMARY KEY,
        hash       text NOT NULL,
        expires_at bigint NOT NULL,
        attempts   integer NOT NULL,
        sent_at    bigint NOT NULL
      )`);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS members (
        email      text PRIMARY KEY,
        access     jsonb NOT NULL,
        checked_at bigint NOT NULL
      )`);
  }

  async getCode(email: string): Promise<StoredCode | undefined> {
    const { rows } = await this.db.query(
      "SELECT hash, expires_at, attempts, sent_at FROM sign_in_codes WHERE email = $1",
      [email],
    );
    const r = rows[0];
    if (!r) return undefined;
    return {
      hash: String(r.hash),
      expiresAt: Number(r.expires_at),
      attempts: Number(r.attempts),
      sentAt: Number(r.sent_at),
    };
  }

  async putCode(email: string, code: StoredCode): Promise<void> {
    await this.db.query(
      `INSERT INTO sign_in_codes (email, hash, expires_at, attempts, sent_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE
         SET hash = EXCLUDED.hash, expires_at = EXCLUDED.expires_at,
             attempts = EXCLUDED.attempts, sent_at = EXCLUDED.sent_at`,
      [email, code.hash, code.expiresAt, code.attempts, code.sentAt],
    );
  }

  async deleteCode(email: string): Promise<void> {
    await this.db.query("DELETE FROM sign_in_codes WHERE email = $1", [email]);
  }

  async getMember(email: string): Promise<Member | undefined> {
    const { rows } = await this.db.query("SELECT email, access, checked_at FROM members WHERE email = $1", [email]);
    const r = rows[0];
    if (!r) return undefined;
    return { email: String(r.email), access: r.access as Access, checkedAt: Number(r.checked_at) };
  }

  async putMember(member: Member): Promise<void> {
    await this.db.query(
      `INSERT INTO members (email, access, checked_at) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (email) DO UPDATE SET access = EXCLUDED.access, checked_at = EXCLUDED.checked_at`,
      [member.email, JSON.stringify(member.access), member.checkedAt],
    );
  }
}
