import { logger } from '../observability/logger.js';
import { createLlamaServerClient } from '../providers/llama-server-client.js';
import { mockModelClient } from '../providers/mock-model-client.js';
import { createDecodeServer } from './decode-server.js';

const PORT = Number(process.env.SIGNUM_DECODE_PORT ?? 5174);
const HOST = process.env.SIGNUM_DECODE_HOST ?? '127.0.0.1';

// SIGNUM_DECODE_PROVIDER=mock runs the same HTTP adapter and decode pipeline with the
// deterministic mock model, so the upload path can be exercised without a model server.
const PROVIDER = process.env.SIGNUM_DECODE_PROVIDER ?? 'llama';
if (PROVIDER !== 'llama' && PROVIDER !== 'mock') {
  throw new Error(`Unknown SIGNUM_DECODE_PROVIDER "${PROVIDER}"; expected "llama" or "mock".`);
}
const client = PROVIDER === 'mock' ? mockModelClient : createLlamaServerClient();
if (PROVIDER === 'mock') logger.warn('Signum decode server is using the mock model adapter');

const server = createDecodeServer(client);
server.listen(PORT, HOST, () => {
  logger.info({ host: HOST, port: PORT }, 'Signum decode server listening');
});
