import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Middleware de modo mantenimiento.
 *
 * Intercepta todas las peticiones cuando MAINTENANCE_MODE=true.
 * - Siempre permite el paso de /health (health check)
 * - Si Accept incluye text/html → retorna página HTML 503
 * - De lo contrario → retorna JSON 503 con mensaje estructurado
 *
 * Configuración via variables de entorno:
 *   MAINTENANCE_MODE=true|false
 *   MAINTENANCE_MESSAGE=Mensaje personalizado
 */
@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // El health endpoint siempre pasa, sin importar el modo mantenimiento
    if (req.path === '/health') {
      return next();
    }

    const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';

    if (!isMaintenanceMode) {
      return next();
    }

    const message =
      process.env.MAINTENANCE_MESSAGE ||
      'El sistema se encuentra en mantenimiento. Por favor intenta más tarde.';

    const acceptHeader = (req.headers['accept'] as string) || '';

    // Si el cliente acepta HTML (navegador directo), devolver página HTML
    if (acceptHeader.includes('text/html')) {
      res.status(503).send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mantenimiento - Zoom Publicidad</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0A0A1A 0%, #1A1A2E 50%, #2D1B4E 100%);
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      color: #ffffff;
    }
    .container {
      text-align: center;
      padding: 48px 32px;
      max-width: 480px;
      background: rgba(22, 33, 62, 0.85);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(46, 176, 196, 0.25);
      border-radius: 16px;
    }
    .icon {
      font-size: 64px;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 16px;
      color: #2EB0C4;
    }
    p {
      font-size: 1rem;
      color: rgba(255,255,255,0.75);
      line-height: 1.6;
    }
    .badge {
      display: inline-block;
      margin-top: 32px;
      padding: 6px 16px;
      border-radius: 9999px;
      background: rgba(46, 176, 196, 0.15);
      border: 1px solid rgba(46, 176, 196, 0.4);
      font-size: 0.8rem;
      color: #2EB0C4;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🔧</div>
    <h1>En Mantenimiento</h1>
    <p>${message}</p>
    <span class="badge">503 — Servicio No Disponible</span>
  </div>
</body>
</html>`);
      return;
    }

    // Para peticiones de API (JSON), devolver respuesta estructurada
    res.status(503).json({
      statusCode: 503,
      error: 'Service Unavailable',
      message,
    });
  }
}
