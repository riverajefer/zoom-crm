/**
 * Environment Utility for Frontend
 *
 * Provides helper functions to detect and work with different environments
 * (development, staging, production) based on Vite environment variables.
 *
 * Usage:
 *   import { isDevelopment, showDemoCredentials } from '@/utils/environment';
 *
 *   if (showDemoCredentials()) {
 *     // Show demo credentials in development only
 *   }
 */

export type Environment = 'development' | 'staging' | 'production';

/**
 * Get the current environment from VITE_ENVIRONMENT
 * Defaults to 'development' if not set
 */
export function getEnvironment(): Environment {
  const env = import.meta.env.VITE_ENVIRONMENT?.toLowerCase();

  if (env === 'production') {
    return 'production';
  }

  if (env === 'staging') {
    return 'staging';
  }

  return 'development';
}

/**
 * Check if the current environment is development
 */
export function isDevelopment(): boolean {
  return getEnvironment() === 'development';
}

/**
 * Check if the current environment is staging
 */
export function isStaging(): boolean {
  return getEnvironment() === 'staging';
}

/**
 * Check if the current environment is production
 */
export function isProduction(): boolean {
  return getEnvironment() === 'production';
}

/**
 * Check if the current environment is production or staging
 * Useful for features that should be disabled in development only
 */
export function isProductionLike(): boolean {
  return isProduction() || isStaging();
}

/**
 * Check if demo credentials should be shown
 * Only shows in development environment
 */
export function showDemoCredentials(): boolean {
  const showDemo = import.meta.env.VITE_SHOW_DEMO_CREDENTIALS;

  // Vite environment variables from .env files are always strings.
  // We check for the string 'true' to determine if demo credentials should be shown.
  return showDemo === 'true';
}

/**
 * Get the API URL from environment variables
 */
export function getApiUrl(): string {
  return import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
}

/**
 * Get the app name from environment variables
 */
export function getAppName(): string {
  return import.meta.env.VITE_APP_NAME || 'Zoom Publicidad CRM';
}

/**
 * Get environment name as string
 */
export function getEnvironmentName(): string {
  return getEnvironment();
}

/**
 * Check if we're in development mode (useful for debugging, logging)
 */
export function isDevMode(): boolean {
  return import.meta.env.DEV;
}

/**
 * Check if we're in production build
 */
export function isProdBuild(): boolean {
  return import.meta.env.PROD;
}
