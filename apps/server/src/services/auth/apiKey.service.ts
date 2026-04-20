import { Env } from "../../bindings";
import { ApiKey, ApiKeyCreatedResponse } from "../../types";

export class ApiKeyService {
  private static readonly PREFIX = "lt_";

  constructor(private env: Env) {}

  public async listKeys(): Promise<ApiKey[]> {
    const { results } = await this.env.DB.prepare(
      "SELECT id, name, prefix, is_active, created_at, last_used_at FROM api_keys ORDER BY created_at DESC"
    ).all<ApiKey>();
    return results;
  }

  public async createKey(name: string): Promise<ApiKeyCreatedResponse & { prefix: string; keyHash: string }> {
    const id = crypto.randomUUID();
    const prefix = this.generateRandomString(8);
    const secret = this.generateRandomString(32);
    const apiKey = `${ApiKeyService.PREFIX}${prefix}.${secret}`;
    const keyHash = await this.hashKey(apiKey);
    const now = new Date().toISOString();

    await this.env.DB.prepare(
      "INSERT INTO api_keys (id, name, key_hash, prefix, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)"
    )
      .bind(id, name, keyHash, prefix, now)
      .run();

    return { apiKey, id, name, prefix, keyHash };
  }

  public async revokeKey(id: string): Promise<void> {
    await this.env.DB.prepare("UPDATE api_keys SET is_active = 0 WHERE id = ?").bind(id).run();
  }

  public async deleteKey(id: string): Promise<void> {
    await this.env.DB.prepare("DELETE FROM api_keys WHERE id = ?").bind(id).run();
  }

  public async validateKey(apiKey: string): Promise<boolean> {
    if (!apiKey.startsWith(ApiKeyService.PREFIX)) return false;

    const keyHash = await this.hashKey(apiKey);
    const result = await this.env.DB.prepare(
      "SELECT id FROM api_keys WHERE key_hash = ? AND is_active = 1"
    )
      .bind(keyHash)
      .first<{ id: string }>();

    if (result) {
      // Update last used at
      await this.env.DB.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), result.id)
        .run();
      return true;
    }

    return false;
  }

  private async hashKey(apiKey: string): Promise<string> {
    const msgUint8 = new TextEncoder().encode(apiKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  private generateRandomString(length: number): string {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const values = new Uint8Array(length);
    crypto.getRandomValues(values);
    return Array.from(values)
      .map((x) => charset[x % charset.length])
      .join("");
  }
}
