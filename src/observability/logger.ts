import pino from 'pino';

const level = process.env.SIGNUM_LOG_LEVEL ?? 'info';

export const logger = pino({
  name: 'signum-decoder',
  level,
  base: null,
});
