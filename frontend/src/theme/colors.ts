/**
 * Tokens de colores de Zoom Publicidad — paleta "Camaleón"
 *
 * Sale del logo: verde lima del camaleón (primario) y azul de sus brazos
 * (secundario). Variante "sobria" (1b): superficies y bordes casi neutros, y
 * el lima reservado para acciones, estado activo y foco. Nada de brillos.
 * El aro de colores del logo queda en `brandRing`, solo para detalles.
 *
 * Los nombres de las exportaciones y de las llaves (neonColors, glow.cyan,
 * vividPurple…) vienen de High y se conservan a propósito: así los
 * componentes y los cherry-picks de High siguen compilando sin tocarlos.
 * Lo que cambió es el valor, no el nombre.
 */

// =============================================================================
// COLORES BASE DEL PROYECTO
// =============================================================================

export const neonColors = {
  // Primary - Verde camaleón
  primary: {
    main: '#A3D33C',
    light: '#C8E68A',
    dark: '#7FAE1F',
    contrastText: '#0B0F0A',
  },

  // Secondary - Azul camaleón
  secondary: {
    main: '#2EA7E0',
    light: '#7CC8EE',
    dark: '#1B7FB0',
    contrastText: '#06121A',
  },

  // Base colors
  base: {
    voidBlack: '#0A0B0A',
    charcoal: '#272A26',
    black: '#000000',
    white: '#FFFFFF',
  },
} as const;

// =============================================================================
// ACENTOS (llaves heredadas de High, valores de Zoom)
// =============================================================================

export const neonAccents = {
  electricCyan: '#C8E68A', // lima claro
  neonMagenta: '#F39200', // naranja del aro
  vividPurple: '#2EA7E0', // azul camaleón
  electricViolet: '#1B7FB0', // azul profundo
  hotPink: '#E8465A', // rojo del aro, suavizado
  neonGreen: '#34C38F', // verde menta
  sunsetOrange: '#F39200', // naranja del aro
} as const;

/** Aro de colores del logo. Solo para detalles, nunca detrás de texto. */
export const brandRing =
  'conic-gradient(from 200deg, #0AA0E0, #7B3F8C, #E30613, #F39200, #FFE500, #9BC31C, #009A44, #0AA0E0)';

// =============================================================================
// COLORES PARA SUPERFICIES Y PROFUNDIDAD (DARK MODE)
// =============================================================================

export const darkSurfaces = {
  deepSpace: '#0E0F0E',
  midnightBlue: '#161816',
  navyMist: '#1A1C19',
  twilight: '#1D201C',
  cosmicPurple: '#1F221E',
} as const;

// =============================================================================
// COLORES PARA SUPERFICIES (LIGHT MODE)
// =============================================================================

export const lightSurfaces = {
  snow: '#FAFBF8',
  cloud: '#F2F5EE',
  mist: '#E3E9DC',
  lavenderTint: '#EEF6DD',
  cyanTint: '#E6F4FB',
} as const;

// =============================================================================
// COLORES DE ESTADO
// =============================================================================

export const stateColors = {
  success: {
    main: '#34C38F',
    light: '#6FDDB3',
    dark: '#1E9A6C',
    contrastText: '#04140D',
  },
  warning: {
    main: '#F2B705',
    light: '#F8D264',
    dark: '#C99400',
    contrastText: '#140E00',
  },
  error: {
    main: '#EF4B4B',
    light: '#F58A8A',
    dark: '#C92F2F',
    contrastText: '#FFFFFF',
  },
  info: {
    main: '#2EA7E0',
    light: '#7CC8EE',
    dark: '#1B7FB0',
    contrastText: '#06121A',
  },
} as const;

// =============================================================================
// CONFIGURACIÓN DE MODOS (DARK/LIGHT)
// =============================================================================

export const darkModeColors = {
  background: {
    default: '#0E0F0E',
    paper: '#161816',
    surface: '#1A1C19',
    elevated: '#1D201C',
  },
  text: {
    primary: '#EEF0EC',
    secondary: '#9EA39A',
    disabled: 'rgba(238, 240, 236, 0.5)',
    muted: 'rgba(158, 163, 154, 0.7)',
  },
  divider: 'rgba(255, 255, 255, 0.07)',
  border: 'rgba(255, 255, 255, 0.08)',
  action: {
    active: '#C8E68A',
    hover: 'rgba(255, 255, 255, 0.05)',
    selected: 'rgba(163, 211, 60, 0.12)',
    disabled: 'rgba(238, 240, 236, 0.3)',
    disabledBackground: 'rgba(238, 240, 236, 0.12)',
  },
} as const;

export const lightModeColors = {
  background: {
    default: '#FFFFFF',
    paper: '#FAFBF8',
    surface: '#F2F5EE',
    elevated: '#FFFFFF',
  },
  text: {
    primary: '#0B0F0A',
    secondary: '#3E4A38',
    disabled: 'rgba(0, 0, 0, 0.38)',
    muted: 'rgba(62, 74, 56, 0.6)',
  },
  divider: 'rgba(11, 15, 10, 0.12)',
  border: '#E3E9DC',
  action: {
    active: '#5E8A12',
    hover: 'rgba(127, 174, 31, 0.08)',
    selected: 'rgba(127, 174, 31, 0.14)',
    disabled: 'rgba(0, 0, 0, 0.26)',
    disabledBackground: 'rgba(0, 0, 0, 0.12)',
  },
} as const;

// =============================================================================
// DEGRADADOS PRINCIPALES
// =============================================================================

export const gradients = {
  // Degradados de marca (botones, headers, elementos destacados)
  neonPrimary: 'linear-gradient(135deg, #A3D33C 0%, #2EA7E0 100%)',
  neonHorizontal: 'linear-gradient(90deg, #C8E68A 0%, #A3D33C 35%, #2EA7E0 100%)',
  neonVertical: 'linear-gradient(180deg, #1B7FB0 0%, #2EA7E0 50%, #A3D33C 100%)',
  sunset: 'linear-gradient(135deg, #FFE500 0%, #F39200 50%, #E30613 100%)',
  ocean: 'linear-gradient(135deg, #A3D33C 0%, #7FAE1F 100%)',

  // Degradados para fondos Dark Mode
  darkBackground: '#0E0F0E',
  darkNeonTint: '#0E0F0E',
  darkSidebar: '#161816',
  darkCard: '#161816',
  darkMesh: '#0E0F0E',

  // Degradados para fondos Light Mode
  lightBackground: 'linear-gradient(135deg, #FFFFFF 0%, #F2F5EE 50%, #FAFBF8 100%)',
  lightTinted: 'linear-gradient(180deg, #FFFFFF 0%, #EEF6DD 50%, #E6F4FB 100%)',
  lightCard: 'linear-gradient(145deg, #FFFFFF 0%, #F2F5EE 100%)',
  lightMesh: `
    radial-gradient(ellipse at 20% 0%, rgba(163, 211, 60, 0.10) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 100%, rgba(46, 167, 224, 0.08) 0%, transparent 50%),
    linear-gradient(135deg, #FFFFFF 0%, #FAFBF8 100%)
  `,

  // Degradados para Headers de tablas
  tableHeaderDark: '#1D201C',
  tableHeaderLight: 'linear-gradient(90deg, rgba(163, 211, 60, 0.14) 0%, rgba(46, 176, 224, 0.08) 100%)',
} as const;

// =============================================================================
// EFECTOS (brillos más contenidos que en High: el lima satura rápido)
// =============================================================================

export const neonEffects = {
  // Brillos desactivados en la variante sobria: se dejan las llaves para que
  // los componentes heredados de High sigan compilando.
  glow: {
    cyan: '0 0 0 transparent',
    cyanSubtle: '0 0 0 transparent',
    cyanIntense: '0 0 0 transparent',
    magenta: '0 0 0 transparent',
    purple: '0 0 0 transparent',
    multi: '0 0 0 transparent',
  },

  textGlow: {
    cyan: 'none',
    magenta: 'none',
    purple: 'none',
  },

  // Glassmorphism
  glass: {
    dark: {
      background: 'rgba(22, 24, 22, 0.85)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
    },
    darkIntense: {
      background: 'rgba(22, 24, 22, 0.92)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    light: {
      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(242, 245, 238, 0.8) 100%)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(127, 174, 31, 0.2)',
    },
  },

  // Gradientes para bordes
  borderGradient: {
    neon: 'linear-gradient(90deg, #A3D33C, #2EA7E0, #A3D33C)',
    static: 'linear-gradient(135deg, #A3D33C 0%, #2EA7E0 100%)',
    ocean: 'linear-gradient(135deg, #C8E68A 0%, #A3D33C 100%)',
  },
} as const;

// =============================================================================
// TRANSICIONES Y ANIMACIONES
// =============================================================================

export const transitions = {
  fast: '0.15s ease',
  normal: '0.3s ease',
  slow: '0.5s ease',
  bounce: '0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  smooth: '0.3s cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

// =============================================================================
// BORDER RADIUS
// =============================================================================

export const borderRadius = {
  small: 4,
  medium: 8,
  large: 12,
  xl: 16,
  xxl: 20,
  round: '50%',
} as const;

// =============================================================================
// SOMBRAS CON TINTE DE COLOR
// =============================================================================

export const shadows = {
  light: {
    sm: '0 1px 3px rgba(0, 0, 0, 0.08)',
    md: '0 4px 12px rgba(0, 0, 0, 0.1)',
    lg: '0 8px 24px rgba(0, 0, 0, 0.12)',
    neon: '0 4px 20px rgba(127, 174, 31, 0.15)',
    neonHover: '0 10px 40px rgba(127, 174, 31, 0.2)',
  },
  dark: {
    sm: '0 1px 3px rgba(0, 0, 0, 0.4)',
    md: '0 4px 12px rgba(0, 0, 0, 0.5)',
    lg: '0 8px 24px rgba(0, 0, 0, 0.6)',
    neon: '0 0 0 transparent',
    neonHover: '0 6px 20px rgba(0, 0, 0, 0.45)',
    card: '0 1px 3px rgba(0, 0, 0, 0.4)',
  },
} as const;

// =============================================================================
// CSS KEYFRAMES (para usar con styled-components o sx prop)
// =============================================================================

export const keyframes = {
  neonPulse: `
    @keyframes neonPulse {
      0%, 100% {
        box-shadow:
          0 0 4px rgba(163, 211, 60, 0.6),
          0 0 12px rgba(163, 211, 60, 0.3);
      }
      50% {
        box-shadow:
          0 0 8px rgba(163, 211, 60, 0.7),
          0 0 20px rgba(163, 211, 60, 0.4),
          0 0 36px rgba(46, 167, 224, 0.25);
      }
    }
  `,
  gradientShift: `
    @keyframes gradientShift {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
  `,
  shimmer: `
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
  `,
  float: `
    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-5px); }
    }
  `,
  borderRotate: `
    @keyframes borderRotate {
      0% { background-position: 0% 0%; }
      100% { background-position: 100% 0%; }
    }
  `,
} as const;
