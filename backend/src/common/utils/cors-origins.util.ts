/** Frontend local de desarrollo (Vite). */
const DEV_FRONTEND_ORIGIN = 'http://localhost:5173';

/**
 * Deja una URL como la manda el navegador en `Origin`: con esquema y sin barra
 * final.
 *
 * `FRONTEND_URL` puede quedar guardada en Railway sin esquema
 * (`zoompublicidadcrm.com`), pero el navegador manda
 * `Origin: https://zoompublicidadcrm.com`. Compararlas tal cual rechazaría al
 * propio frontend y tumbaría el login.
 */
export function normalizeOrigin(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/+$/, '');
  if (!trimmed) return undefined;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Orígenes que CORS deja pasar.
 *
 * Salen del entorno y no del código, para que un despliegue con otro dominio
 * —el clon de Zoom— no tenga que tocar `main.ts`:
 *  - `CORS_ORIGINS`, lista separada por comas, si está definida.
 *  - Si no, `FRONTEND_URL`.
 *  - En desarrollo se suma siempre el Vite local.
 *
 * Fuera de desarrollo no se agrega nada por defecto: ni localhost ni el dominio
 * de otro ambiente. Antes producción aceptaba también el frontend de pruebas.
 */
export function resolveCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const source = env.CORS_ORIGINS?.trim() ? env.CORS_ORIGINS : env.FRONTEND_URL;
  const origins = (source ?? '')
    .split(',')
    .map(normalizeOrigin)
    .filter((origin): origin is string => Boolean(origin));

  // Misma regla que `getEnvironment`: cualquier NODE_ENV que no sea staging o
  // production cuenta como desarrollo.
  const nodeEnv = env.NODE_ENV?.toLowerCase();
  if (nodeEnv !== 'production' && nodeEnv !== 'staging') {
    origins.push(DEV_FRONTEND_ORIGIN);
  }

  return [...new Set(origins)];
}
