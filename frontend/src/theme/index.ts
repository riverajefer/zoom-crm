/**
 * Sistema de Theming - paleta Camaleón de Zoom
 *
 * Este archivo exporta:
 * - lightTheme: Tema claro con efectos neón sutiles y elegantes
 * - darkTheme: Tema oscuro con efectos neón intensos y glassmorphism
 * - Colores, degradados y tokens de diseño para uso en componentes
 * - Efectos y utilidades CSS
 */

// Temas principales
export { lightTheme } from './lightTheme';
export { darkTheme } from './darkTheme';

// Colores y tokens de diseño
export {
  // Colores principales
  neonColors,
  neonAccents,
  stateColors,
  brandRing,

  // Superficies por modo
  darkSurfaces,
  lightSurfaces,
  darkModeColors,
  lightModeColors,

  // Degradados
  gradients,

  // Efectos neón y glassmorphism
  neonEffects,

  // Utilidades
  transitions,
  borderRadius,
  shadows,
  keyframes,
} from './colors';

// Re-exportar tipos útiles de MUI
export type { Theme } from '@mui/material/styles';
