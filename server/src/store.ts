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
  /** Removes everything held about one email. Used by account deletion. */
  deleteMemberData(email: string): Promise<void>;
}

export class MemoryStore implements Store {
  private codes = new Map<string, StoredCode>();
  private members = new Map<string, Member>();
  private drops = new Map<string, Drop>();
  private usage = new Map<string, number>();
  private sync = new Map<string, unknown>();

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
  async deleteMemberData(email: string) {
    this.codes.delete(email);
    this.members.delete(email);
    for (const map of [this.usage, this.sync] as Map<string, unknown>[]) {
      for (const key of [...map.keys()]) if (key.startsWith(`${email}|`)) map.delete(key);
    }
  }
}
