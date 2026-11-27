// Postgres-backed storage. Survives restarts, unlike MemoryStore.
import pg from "pg";
import type { Access } from "./access.ts";
import type { StoredCode } from "./codes.ts";
import type { Drop } from "./drops.ts";
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
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS drops (
        id         text PRIMARY KEY,
        data       jsonb NOT NULL,
        created_at bigint NOT NULL
      )`);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS usage_counts (
        email text NOT NULL,
        kind  text NOT NULL,
        day   text NOT NULL,
        n     integer NOT NULL,
        PRIMARY KEY (email, kind, day)
      )`);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS sync_docs (
        email      text NOT NULL,
        part       text NOT NULL,
        data       jsonb NOT NULL,
        updated_at bigint NOT NULL,
        PRIMARY KEY (email, part)
      )`);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS checkins (
        email text NOT NULL,
        day   text NOT NULL,
        PRIMARY KEY (email, day)
      )`);
    await this.db.query("CREATE INDEX IF NOT EXISTS checkins_day ON checkins (day)");
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

  async listDrops(): Promise<Drop[]> {
    const { rows } = await this.db.query("SELECT data FROM drops ORDER BY created_at DESC");
    return rows.map((r) => r.data as Drop);
  }

  async getDrop(id: string): Promise<Drop | undefined> {
    const { rows } = await this.db.query("SELECT data FROM drops WHERE id = $1", [id]);
    return rows[0] ? (rows[0].data as Drop) : undefined;
  }

  async putDrop(drop: Drop): Promise<void> {
    await this.db.query(
      `INSERT INTO drops (id, data, created_at) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [drop.id, JSON.stringify(drop), drop.createdAt],
    );
  }

  async deleteDrop(id: string): Promise<void> {
    await this.db.query("DELETE FROM drops WHERE id = $1", [id]);
  }

  async bumpUsage(email: string, kind: string, day: string): Promise<number> {
    const { rows } = await this.db.query(
      `INSERT INTO usage_counts (email, kind, day, n) VALUES ($1, $2, $3, 1)
       ON CONFLICT (email, kind, day) DO UPDATE SET n = usage_counts.n + 1
       RETURNING n`,
      [email, kind, day],
    );
    return Number(rows[0]?.n ?? 1);
  }

  async getSync(email: string, part: string): Promise<unknown | undefined> {
    const { rows } = await this.db.query("SELECT data FROM sync_docs WHERE email = $1 AND part = $2", [email, part]);
    return rows[0]?.data;
  }

  async putSync(email: string, part: string, data: unknown, updatedAt: number): Promise<void> {
    await this.db.query(
      `INSERT INTO sync_docs (email, part, data, updated_at) VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (email, part) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [email, part, JSON.stringify(data), updatedAt],
    );
  }

  async setCheckin(email: string, day: string, done: boolean): Promise<void> {
    if (done) {
      await this.db.query("INSERT INTO checkins (email, day) VALUES ($1, $2) ON CONFLICT DO NOTHING", [email, day]);
    } else {
      await this.db.query("DELETE FROM checkins WHERE email = $1 AND day = $2", [email, day]);
    }
  }

  async countCheckins(day: string): Promise<number> {
    const { rows } = await this.db.query("SELECT count(*)::int AS n FROM checkins WHERE day = $1", [day]);
    return Number(rows[0]?.n ?? 0);
  }

  async deleteMemberData(email: string): Promise<void> {
    for (const table of ["sign_in_codes", "members", "usage_counts", "sync_docs", "checkins"]) {
      await this.db.query(`DELETE FROM ${table} WHERE email = $1`, [email]);
    }
  }
}
