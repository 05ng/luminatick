import { Env } from '../bindings';

export class StorageService {
  constructor(private env: Env) {}

  async uploadAttachment(
    ticketId: string,
    articleId: string,
    fileName: string,
    content: Uint8Array,
    contentType: string
  ): Promise<string> {
    // Sanitize filename to prevent path traversal
    const safeFileName = fileName
      .replace(/[^a-zA-Z0-9.\-_]/g, '_')
      .replace(/^\.+/, '') // No leading dots
      .replace(/\.\.+/g, '.'); // No multiple dots

    const key = `attachments/${ticketId}/${articleId}/${safeFileName}`;
    await this.env.ATTACHMENTS_BUCKET.put(key, content, {
      httpMetadata: { contentType },
    });
    return key;
  }

  async getAttachment(key: string): Promise<Response | null> {
    const obj = await this.env.ATTACHMENTS_BUCKET.get(key);
    if (!obj) return null;
    
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('etag', obj.httpEtag);
    
    return new Response(obj.body, { headers });
  }
}
