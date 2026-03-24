import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: isProd ? 'info' : 'debug',
  ...(isProd ? {} : { transport: { target: 'pino/file', options: { destination: 1 } } }),
});
