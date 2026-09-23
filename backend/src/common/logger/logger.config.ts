import { randomUUID } from 'crypto';
import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'http';
import { getEnvironmentName, isDevelopment } from '../utils/environment.util';
import { getAuditContext } from '../utils/audit-context';

/**
 * Factory de opciones para nestjs-pino.
 *
 * - En desarrollo usa `pino-pretty` para salida legible en consola.
 * - En staging/producción hace push estructurado (JSON) a Grafana Cloud Loki
 *   mediante el transporte `pino-loki`, siempre que las variables LOKI_* estén
 *   configuradas. Si no lo están, cae a stdout en JSON (Railway lo captura igual).
 *
 * Los logs se enriquecen con userId/ip/userAgent reutilizando el contexto de
 * auditoría (AsyncLocalStorage) que abre AuditContextMiddleware y completa
 * AuditContextInterceptor. El log de inicio de request sale sin userId porque
 * los guards todavía no han corrido; el de fin de request ya lo trae.
 */
export function buildLoggerConfig(): Params {
  const level = process.env.LOG_LEVEL ?? 'info';
  const env = getEnvironmentName();

  const lokiConfigured = Boolean(
    process.env.LOKI_HOST &&
      process.env.LOKI_USER &&
      process.env.LOKI_API_KEY,
  );

  // Objeto de transporte de pino (pino-pretty | pino-loki) o undefined (JSON a stdout).
  // Se tipa como `any` porque pino acepta varias formas de transport según el target.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let transport: any;

  if (isDevelopment()) {
    transport = {
      target: 'pino-pretty',
      options: {
        singleLine: true,
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  } else if (lokiConfigured) {
    transport = {
      target: 'pino-loki',
      options: {
        host: process.env.LOKI_HOST,
        basicAuth: {
          username: process.env.LOKI_USER,
          password: process.env.LOKI_API_KEY,
        },
        // Etiqueta propia del fork: High Solutions usa 'backoffice-backend'.
        // Si las dos empresas empujan al mismo Grafana con la misma etiqueta,
        // sus logs caen en el mismo stream y no hay forma de separarlos.
        labels: { app: 'zoom-backend', env },
        batching: true,
        interval: 5,
      },
    };
  } else {
    // Sin Loki configurado en un entorno productivo: JSON plano a stdout.
    transport = undefined;
  }

  return {
    pinoHttp: {
      level,
      transport,
      // Emitir el nivel como texto ("info"/"warn"/"error") en vez de numérico,
      // para que las queries LogQL tipo `level="error"` funcionen en Grafana.
      formatters: {
        level: (label) => ({ level: label }),
      },
      // Asignar el nivel del log del request según el status HTTP:
      // 5xx o error -> error, 4xx -> warn, resto -> info.
      customLogLevel: (_req, res, err) => {
        if (res.statusCode >= 500 || err) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      // Id de correlación por request
      genReqId: (req: IncomingMessage) =>
        (req.headers['x-request-id'] as string) || randomUUID(),
      // Etiqueta base para todos los logs
      base: { app: 'zoom-backend', env },
      // Enriquecer cada log con el contexto de auditoría del request
      customProps: () => {
        const { userId, ipAddress, userAgent } = getAuditContext();
        return { userId, ip: ipAddress, userAgent };
      },
      // No loguear el healthcheck para evitar ruido
      autoLogging: {
        ignore: (req: IncomingMessage) => req.url === '/health',
      },
      // Ocultar datos sensibles antes de enviarlos a Loki
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.currentPassword',
          'req.body.newPassword',
          'req.body.refreshToken',
          'res.headers["set-cookie"]',
          '*.accessToken',
          '*.refreshToken',
          '*.password',
        ],
        censor: '[Redacted]',
      },
      serializers: {
        req: (req: IncomingMessage & { params?: unknown; query?: unknown }) => ({
          id: (req as any).id,
          method: (req as any).method,
          url: (req as any).url,
        }),
        res: (res: ServerResponse) => ({
          statusCode: res.statusCode,
        }),
      },
    },
  };
}
