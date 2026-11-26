// Storage interface. MemoryStore is for development and tests only: it loses
// everything on restart. Production needs a database-backed Store.
import type { Access } from "./access.ts";
import type { StoredCode } from "./codes.ts";

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
}

export class MemoryStore implements Store {
  private codes = new Map<string, StoredCode>();
  private members = new Map<string, Member>();

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
}
