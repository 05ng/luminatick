import { Env } from '../bindings';
import { VectorService } from '../services/vector.service';

export default {
  async fetch(req: Request, env: Env) {
    const service = new VectorService(env);
    try {
      await service.upsert('test-id', Array(1024).fill(0.1), { source_id: '123', type: 'document', text: 'test' });
      return new Response('Success');
    } catch(e) {
      return new Response(e.message, {status: 500});
    }
  }
}
