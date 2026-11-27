// Storage interface. MemoryStore is for development and tests only: it loses
// everything on restart. Production needs a database-backed Store.
import type { Access } from "./access.ts";
import type { StoredCode } from "./codes.ts";
import type { Drop } from "./drops.ts";

export interface Member {
  email: string;
  access: Access;
  /** When access was last confirmed with Loop (ms since epoch). */
  checkedAt: number;
}

/** A reward a member has claimed. */
export interface Redemption {
  id: string;
  email: string;
  rewardId: string;
  title: string;
  cost: number;
  code: string;
  url: string;
  createdAt: number;
}

export interface Store {
  getCode(email: string): Promise<StoredCode | undefined>;
  putCode(email: string, code: StoredCode): Promise<void>;
  deleteCode(email: string): Promise<void>;
  getMember(email: string): Promise<Member | undefined>;
  putMember(member: Member): Promise<void>;
  listDrops(): Promise<Drop[]>;
  getDrop(id: string): Promise<Drop | undefined>;
  putDrop(drop: Drop): Promise<void>;
  deleteDrop(id: string): Promise<void>;
  /** Adds one to a member's counter for a day and returns the new total. Used to cap paid features. */
  bumpUsage(email: string, kind: string, day: string): Promise<number>;
  /** A member's synced app data (check-ins, training log), one document per part. */
  getSync(email: string, part: string): Promise<unknown | undefined>;
  putSync(email: string, part: string, data: unknown, updatedAt: number): Promise<void>;
  /** Marks or unmarks that a member checked in on a day (their local date, YYYY-MM-DD). */
  setCheckin(email: string, day: string, done: boolean): Promise<void>;
  /** How many members checked in on a day. */
  countCheckins(day: string): Promise<number>;
  /** Points. Each entry is unique per (email, kind, ref), so awarding twice does nothing. Returns false on a repeat. */
  addPoints(email: string, kind: string, ref: string, points: number, now: number): Promise<boolean>;
  removePoints(email: string, kind: string, ref: string): Promise<void>;
  pointsBalance(email: string): Promise<number>;
  /** Takes points only if the balance covers it, as one step, so two taps can't spend the same points. */
  spendPoints(email: string, cost: number, ref: string, now: number): Promise<boolean>;
  /** The days a member checked in, newest first. */
  listCheckinDays(email: string, limit: number): Promise<string[]>;
  putRedemption(r: Redemption): Promise<void>;
  listRedemptions(email: string): Promise<Redemption[]>;
  /** Push: which phones belong to which member. A token moves to whoever registered it last. */
  putPushToken(email: string, token: string, platform: string, now: number): Promise<void>;
  deletePushToken(token: string): Promise<void>;
  listPushTokens(): Promise<{ email: string; token: string }[]>;
  /** Removes everything held about one email. Used by account deletion. */
  deleteMemberData(email: string): Promise<void>;
}

export class MemoryStore implements Store {
  private codes = new Map<string, StoredCode>();
  private members = new Map<string, Member>();
  private drops = new Map<string, Drop>();
  private usage = new Map<string, number>();
  private sync = new Map<string, unknown>();
  private checkins = new Map<string, Set<string>>();
  private pushTokens = new Map<string, string>(); // token -> email
  private ledger = new Map<string, { email: string; points: number }>();
  private redemptions: Redemption[] = [];

  async getCode(email: string) {
    return this.codes.get(email);
  }
  async putCode(email: string, code: StoredCode) {
    this.codes.set(email, code);
  }
  async deleteCode(email: string) {
    this.codes.delete(email);
  }
  async getMember(email: string) {
    return this.members.get(email);
  }
  async putMember(member: Member) {
    this.members.set(member.email, member);
  }
  async listDrops() {
    return [...this.drops.values()];
  }
  async getDrop(id: string) {
    return this.drops.get(id);
  }
  async putDrop(drop: Drop) {
    this.drops.set(drop.id, drop);
  }
  async deleteDrop(id: string) {
    this.drops.delete(id);
  }
  async bumpUsage(email: string, kind: string, day: string) {
    const key = `${email}|${kind}|${day}`;
    const n = (this.usage.get(key) ?? 0) + 1;
    this.usage.set(key, n);
    return n;
  }
  async getSync(email: string, part: string) {
    return this.sync.get(`${email}|${part}`);
  }
  async putSync(email: string, part: string, data: unknown) {
    this.sync.set(`${email}|${part}`, data);
  }
  async setCheckin(email: string, day: string, done: boolean) {
    const set = this.checkins.get(day) ?? new Set<string>();
    if (done) set.add(email);
    else set.delete(email);
    this.checkins.set(day, set);
  }
  async countCheckins(day: string) {
    return this.checkins.get(day)?.size ?? 0;
  }
  async addPoints(email: string, kind: string, ref: string, points: number) {
    const key = `${email}|${kind}|${ref}`;
    if (this.ledger.has(key)) return false;
    this.ledger.set(key, { email, points });
    return true;
  }
  async removePoints(email: string, kind: string, ref: string) {
    this.ledger.delete(`${email}|${kind}|${ref}`);
  }
  async pointsBalance(email: string) {
    let sum = 0;
    for (const row of this.ledger.values()) if (row.email === email) sum += row.points;
    return sum;
  }
  async spendPoints(email: string, cost: number, ref: string) {
    // No await between the check and the write, so this can't interleave.
    let sum = 0;
    for (const row of this.ledger.values()) if (row.email === email) sum += row.points;
    if (sum < cost) return false;
    this.ledger.set(`${email}|redeem|${ref}`, { email, points: -cost });
    return true;
  }
  async listCheckinDays(email: string, limit: number) {
    const days = [...this.checkins].filter(([, set]) => set.has(email)).map(([day]) => day);
    return days.sort().reverse().slice(0, limit);
  }
  async putRedemption(r: Redemption) {
    this.redemptions.push(r);
  }
  async listRedemptions(email: string) {
    return this.redemptions.filter((r) => r.email === email).sort((a, b) => b.createdAt - a.createdAt);
  }
  async putPushToken(email: string, token: string) {
    this.pushTokens.set(token, email);
  }
  async deletePushToken(token: string) {
    this.pushTokens.delete(token);
  }
  async listPushTokens() {
    return [...this.pushTokens].map(([token, email]) => ({ email, token }));
  }
  async deleteMemberData(email: string) {
    for (const [token, owner] of [...this.pushTokens]) if (owner === email) this.pushTokens.delete(token);
    for (const [key, row] of [...this.ledger]) if (row.email === email) this.ledger.delete(key);
    this.redemptions = this.redemptions.filter((r) => r.email !== email);
    for (const set of this.checkins.values()) set.delete(email);
    this.codes.delete(email);
    this.members.delete(email);
    for (const map of [this.usage, this.sync] as Map<string, unknown>[]) {
      for (const key of [...map.keys()]) if (key.startsWith(`${email}|`)) map.delete(key);
    }
  }
}
