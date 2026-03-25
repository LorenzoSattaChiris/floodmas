import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino(
  { level: isDev ? 'debug' : 'info' },
  isDev
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname,req,res,responseTime',
          messageFormat: '{msg}',
          errorLikeObjectKeys: ['err', 'error'],
          errorProps: 'message,stack',
          singleLine: false,
        },
      })
    : pino.destination(1),
);
