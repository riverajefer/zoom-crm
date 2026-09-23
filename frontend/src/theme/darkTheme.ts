import { createTheme, alpha } from '@mui/material/styles';
import {
  neonColors,
  neonAccents,
  stateColors,
  darkModeColors,
  darkSurfaces,
  neonEffects,
  gradients,
  borderRadius,
  shadows,
} from './colors';

/**
 * Tema Oscuro - Estilo Neón Elegante con Degradados
 * Efectos neón intensos, glassmorphism y degradados vibrantes
 */
export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      ...neonColors.primary,
      main: neonColors.primary.main,
    },
    secondary: {
      ...neonColors.secondary,
      light: neonAccents.vividPurple,
    },
    success: stateColors.success,
    warning: stateColors.warning,
    error: stateColors.error,
    info: stateColors.info,
    background: {
      default: darkModeColors.background.default,
      paper: darkModeColors.background.paper,
    },
    text: darkModeColors.text,
    divider: darkModeColors.divider,
    action: darkModeColors.action,
  },

  typography: {
    fontFamily: [
      'Inter',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: {
      fontSize: '2.5rem',
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 700,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 600,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 600,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
    },
    subtitle1: {
      fontSize: '1rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    subtitle2: {
      fontSize: '0.875rem',
      fontWeight: 500,
      lineHeight: 1.57,
    },
    body1: {
      fontSize: '1rem',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: 1.57,
    },
    button: {
      fontWeight: 600,
      textTransform: 'none',
    },
  },

  shape: {
    borderRadius: borderRadius.medium,
  },

  shadows: [
    'none',
    shadows.dark.sm,
    shadows.dark.sm,
    shadows.dark.md,
    shadows.dark.md,
    shadows.dark.md,
    shadows.dark.lg,
    shadows.dark.lg,
    shadows.dark.lg,
    shadows.dark.lg,
    shadows.dark.lg,
    shadows.dark.lg,
    shadows.dark.lg,
    shadows.dark.lg,
    shadows.dark.lg,
    shadows.dark.lg,
    shadows.dark.lg,
    shadows.dark.lg,
    shadows.dark.lg,
    shadows.dark.lg,
    shadows.dark.lg,
    shadows.dark.lg,
    shadows.dark.lg,
    shadows.dark.lg,
    shadows.dark.lg,
  ],

  components: {
    // =========================================================================
    // CssBaseline - Estilos globales y animaciones
    // =========================================================================
    MuiCssBaseline: {
      styleOverrides: {
        '@global': {
          '@keyframes neonPulse': {
            '0%, 100%': {
              boxShadow: 'none',
            },
            '50%': {
              boxShadow: `0 0 48px ${alpha(neonColors.secondary.main, 0.25)}`,
            },
          },
          '@keyframes gradientShift': {
            '0%': { backgroundPosition: '0% 50%' },
            '50%': { backgroundPosition: '100% 50%' },
            '100%': { backgroundPosition: '0% 50%' },
          },
          '@keyframes shimmer': {
            '0%': { backgroundPosition: '-200% 0' },
            '100%': { backgroundPosition: '200% 0' },
          },
        },
        html: {
          scrollBehavior: 'smooth',
        },
        body: {
          background: gradients.darkMesh,
          backgroundAttachment: 'fixed',
          scrollbarColor: `${alpha(neonColors.primary.main, 0.4)} transparent`,
          '&::-webkit-scrollbar': {
            width: 10,
            height: 10,
          },
          '&::-webkit-scrollbar-thumb': {
            background: `linear-gradient(180deg, ${neonColors.primary.main} 0%, ${neonAccents.vividPurple} 100%)`,
            borderRadius: 5,
            '&:hover': {
              background: `linear-gradient(180deg, ${neonColors.primary.light} 0%, ${neonAccents.vividPurple} 100%)`,
              boxShadow: neonEffects.glow.cyanSubtle,
            },
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: alpha(darkSurfaces.midnightBlue, 0.5),
          },
        },
        '::selection': {
          backgroundColor: alpha(neonColors.primary.main, 0.3),
          color: neonColors.base.white,
        },
      },
    },

    // =========================================================================
    // Botones - Con gradientes y efectos neón
    // =========================================================================
    MuiButton: {
      variants: [
        {
          props: { size: 'verySmall' },
          style: {
            padding: '2px 8px',
            fontSize: '0.75rem',
            lineHeight: 1.5,
          },
        },
      ],
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: borderRadius.large,
          padding: '11px 28px',
          fontSize: '0.9375rem',
          letterSpacing: '0.02em',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: '-100%',
            width: '100%',
            height: '100%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
            transition: 'left 0.5s ease',
          },
          '&:hover::before': {
            left: '100%',
          },
        },
        contained: {
          boxShadow: `0 2px 6px rgba(0, 0, 0, 0.35)`,
          '&:hover': {
            transform: 'translateY(-3px)',
            boxShadow: `${neonEffects.glow.cyanIntense}, 0 2px 6px rgba(0, 0, 0, 0.35)`,
          },
          '&:active': {
            transform: 'translateY(-1px)',
            boxShadow: `0 2px 6px rgba(0, 0, 0, 0.35)`,
          },
          '&.Mui-disabled': {
            background: alpha(neonColors.primary.main, 0.15),
            color: alpha(darkModeColors.text.primary, 0.3),
            boxShadow: 'none',
          },
        },
        containedPrimary: {
          background: `linear-gradient(135deg, ${neonColors.primary.main} 0%, ${neonColors.primary.dark} 100%)`,
          color: neonColors.primary.contrastText,
          fontWeight: 600,
          boxShadow: `0 2px 6px rgba(0, 0, 0, 0.35)`,
          '&:hover': {
            background: `linear-gradient(135deg, ${neonColors.primary.light} 0%, ${neonColors.primary.main} 100%)`,
            boxShadow: `${neonEffects.glow.cyanIntense}, 0 2px 6px rgba(0, 0, 0, 0.35)`,
          },
          '&:active': {
            background: `linear-gradient(135deg, ${neonColors.primary.dark} 0%, ${alpha(neonColors.primary.dark, 0.9)} 100%)`,
          },
        },
        containedSecondary: {
          background: `linear-gradient(135deg, ${neonAccents.vividPurple} 0%, ${neonAccents.electricViolet} 100%)`,
          color: neonColors.secondary.contrastText,
          fontWeight: 600,
          boxShadow: `0 2px 6px rgba(0, 0, 0, 0.35)`,
          '&:hover': {
            background: `linear-gradient(135deg, ${alpha(neonAccents.vividPurple, 0.95)} 0%, ${neonAccents.vividPurple} 100%)`,
            boxShadow: `${neonEffects.glow.multi}, 0 2px 6px rgba(0, 0, 0, 0.35)`,
          },
        },
        containedSuccess: {
          background: `linear-gradient(135deg, ${stateColors.success.main} 0%, ${stateColors.success.dark} 100%)`,
          color: stateColors.success.contrastText,
          fontWeight: 600,
          boxShadow: `0 2px 6px rgba(0, 0, 0, 0.35)`,
          '&:hover': {
            background: `linear-gradient(135deg, ${stateColors.success.light} 0%, ${stateColors.success.main} 100%)`,
            boxShadow: `0 2px 6px rgba(0, 0, 0, 0.35)`,
          },
        },
        containedError: {
          background: `linear-gradient(135deg, ${stateColors.error.main} 0%, ${alpha(stateColors.error.main, 0.9)} 100%)`,
          color: stateColors.error.contrastText,
          fontWeight: 600,
          boxShadow: `0 2px 6px rgba(0, 0, 0, 0.35)`,
          '&:hover': {
            background: `linear-gradient(135deg, ${stateColors.error.light} 0%, ${stateColors.error.main} 100%)`,
            boxShadow: `${neonEffects.glow.magenta}, 0 2px 6px rgba(0, 0, 0, 0.35)`,
          },
        },
        containedWarning: {
          background: `linear-gradient(135deg, ${stateColors.warning.main} 0%, ${stateColors.warning.dark} 100%)`,
          color: stateColors.warning.contrastText,
          fontWeight: 600,
          boxShadow: `0 2px 6px rgba(0, 0, 0, 0.35)`,
          '&:hover': {
            background: `linear-gradient(135deg, ${stateColors.warning.light} 0%, ${stateColors.warning.main} 100%)`,
            boxShadow: `0 2px 6px rgba(0, 0, 0, 0.35)`,
          },
        },
        outlined: {
          '&:hover': {
            backgroundColor: darkModeColors.action.hover,
          },
        },
        outlinedPrimary: {
          color: darkModeColors.text.primary,
          borderColor: alpha('#FFFFFF', 0.16),
          '&:hover': {
            color: neonColors.primary.light,
            borderColor: neonColors.primary.main,
          },
        },
        outlinedSecondary: {
          borderColor: neonAccents.vividPurple,
          '&:hover': {
            borderColor: neonAccents.vividPurple,
            backgroundColor: alpha(neonAccents.vividPurple, 0.1),
            boxShadow: 'none',
          },
        },
        text: {
          '&:hover': {
            backgroundColor: darkModeColors.action.hover,
            textShadow: 'none',
          },
        },
      },
      defaultProps: {
        disableElevation: true,
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: 'all 0.3s ease',
          '&:hover': {
            backgroundColor: darkModeColors.action.hover,
            boxShadow: 'none',
            transform: 'scale(1.1)',
          },
        },
      },
    },

    MuiFab: {
      styleOverrides: {
        root: {
          background: gradients.ocean,
          boxShadow: `0 2px 6px rgba(0, 0, 0, 0.35)`,
          '&:hover': {
            background: gradients.ocean,
            boxShadow: neonEffects.glow.cyanIntense,
            transform: 'scale(1.1)',
          },
        },
      },
    },

    // =========================================================================
    // Inputs y Forms - Con glow neón en focus
    // =========================================================================
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            transition: 'all 0.3s ease',
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(neonColors.primary.main, 0.6),
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: neonColors.primary.main,
              borderWidth: 2,
              boxShadow: neonEffects.glow.cyanSubtle,
            },
          },
        },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.medium,
          backgroundColor: alpha(darkSurfaces.deepSpace, 0.65),
          backdropFilter: 'blur(8px)',
          transition: 'all 0.3s ease',
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha(neonColors.primary.main, 0.6),
          },
          '&.Mui-focused': {
            backgroundColor: alpha(darkSurfaces.deepSpace, 0.8),
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: neonColors.primary.main,
              boxShadow: `0 ${neonEffects.glow.cyanSubtle}`,
            },
          },
        },
        notchedOutline: {
          borderColor: darkModeColors.border,
          transition: 'all 0.3s ease',
        },
      },
    },

    MuiInputLabel: {
      styleOverrides: {
        root: {
          '&.Mui-focused': {
            color: neonColors.primary.main,
            textShadow: 'none',
          },
        },
      },
    },

    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.medium,
        },
      },
    },

    MuiAutocomplete: {
      styleOverrides: {
        paper: {
          borderRadius: borderRadius.large,
          background: gradients.darkCard,
          backdropFilter: 'blur(16px)',
          boxShadow: `${shadows.dark.lg}, ${shadows.dark.neon}`,
          border: `1px solid ${darkModeColors.border}`,
        },
        option: {
          borderRadius: borderRadius.small,
          margin: '2px 8px',
          '&:hover': {
            backgroundColor: darkModeColors.action.hover,
          },
          '&[aria-selected="true"]': {
            backgroundColor: alpha(neonColors.primary.main, 0.2),
          },
        },
      },
    },

    // =========================================================================
    // Cards y Surfaces - Glassmorphism con gradientes
    // =========================================================================
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.xl,
          background: gradients.darkCard,
          backdropFilter: 'blur(16px)',
          border: `1px solid ${darkModeColors.border}`,
          boxShadow: `${shadows.dark.card}`,
          transition: 'all 0.3s ease',
          '&:hover': {
            borderColor: alpha(neonColors.primary.main, 0.5),
            boxShadow: `${shadows.dark.card}, ${shadows.dark.neonHover}`,
            transform: 'translateY(-4px)',
          },
        },
      },
    },

    MuiCardHeader: {
      styleOverrides: {
        root: {
          padding: '24px 24px 12px',
        },
        title: {
          fontWeight: 600,
          color: neonColors.base.white,
        },
        subheader: {
          color: darkModeColors.text.secondary,
        },
      },
    },

    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: '12px 24px 24px',
          '&:last-child': {
            paddingBottom: 24,
          },
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          background: gradients.darkCard,
          backdropFilter: 'blur(12px)',
          boxShadow: `${shadows.dark.sm}`,
        },
        rounded: {
          borderRadius: borderRadius.large,
        },
        elevation1: {
          background: `linear-gradient(145deg, ${alpha(darkSurfaces.midnightBlue, 0.95)} 0%, ${alpha(darkSurfaces.navyMist, 0.9)} 100%)`,
          boxShadow: `${shadows.dark.sm}`,
          border: `1px solid ${alpha(darkModeColors.border, 0.6)}`,
        },
        elevation2: {
          boxShadow: `${shadows.dark.md}`,
          border: `1px solid ${alpha(darkModeColors.border, 0.8)}`,
        },
        elevation3: {
          boxShadow: `${shadows.dark.lg}, ${shadows.dark.neon}`,
          border: `1px solid ${darkModeColors.border}`,
        },
      },
    },

    // =========================================================================
    // Tables y DataGrid - Con headers gradient y filas vibrantes
    // =========================================================================
    MuiTableContainer: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.large,
          border: `1px solid ${darkModeColors.border}`,
          overflow: 'hidden',
        },
      },
    },

    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            background: gradients.tableHeaderDark,
            fontWeight: 600,
            color: darkModeColors.text.secondary,
            borderBottom: `1px solid ${darkModeColors.border}`,
            textTransform: 'uppercase',
            fontSize: '0.75rem',
            letterSpacing: '0.05em',
          },
        },
      },
    },

    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'all 0.2s ease',
          '&:nth-of-type(even)': {
            backgroundColor: alpha('#FFFFFF', 0.025),
          },
          '&:hover': {
            backgroundColor: darkModeColors.action.hover,
          },
          '&.Mui-selected': {
            backgroundColor: darkModeColors.action.selected,
            borderLeft: `3px solid ${neonColors.primary.main}`,
            '&:hover': {
              backgroundColor: alpha(neonColors.primary.main, 0.16),
            },
          },
        },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${darkModeColors.border}`,
          padding: '16px',
        },
      },
    },

    MuiTablePagination: {
      styleOverrides: {
        root: {
          background: gradients.darkCard,
          borderTop: `1px solid ${darkModeColors.border}`,
        },
      },
    },

    // =========================================================================
    // Navigation - Sidebar con gradiente neón
    // =========================================================================
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: `1px solid ${darkModeColors.border}`,
          background: gradients.darkSidebar,
          backgroundImage: 'none',
        },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.large,
          margin: '4px 12px',
          padding: '12px 16px',
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: darkModeColors.action.hover,
            transform: 'translateX(4px)',
          },
          '&.Mui-selected': {
            backgroundColor: alpha(neonColors.primary.main, 0.12),
            '&::before': {
              content: '""',
              position: 'absolute',
              left: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 4,
              height: '60%',
              background: neonColors.primary.main,
              borderRadius: '0 4px 4px 0',
              boxShadow: 'none',
            },
            '&:hover': {
              backgroundColor: alpha(neonColors.primary.main, 0.16),
              transform: 'translateX(4px)',
            },
            '& .MuiListItemIcon-root': {
              color: neonColors.primary.main,
              filter: 'none',
            },
            '& .MuiListItemText-primary': {
              color: neonColors.primary.main,
              fontWeight: 600,
            },
          },
        },
      },
    },

    MuiListItemIcon: {
      styleOverrides: {
        root: {
          minWidth: 40,
          color: darkModeColors.text.secondary,
          transition: 'all 0.2s ease',
        },
      },
    },

    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
          borderBottom: `1px solid ${darkModeColors.border}`,
          background: `linear-gradient(90deg, ${alpha(darkSurfaces.midnightBlue, 0.95)} 0%, ${alpha(darkSurfaces.cosmicPurple, 0.9)} 100%)`,
          backdropFilter: 'blur(16px)',
          color: darkModeColors.text.primary,
        },
      },
    },

    MuiToolbar: {
      styleOverrides: {
        root: {
          minHeight: '64px !important',
        },
      },
    },

    // =========================================================================
    // Dialogs y Modals - Glassmorphism intenso
    // =========================================================================
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: borderRadius.xl,
          background: neonEffects.glass.darkIntense.background,
          backdropFilter: 'blur(20px)',
          border: `1px solid ${darkModeColors.border}`,
          boxShadow: `${shadows.dark.lg}`,
        },
      },
    },

    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: '1.25rem',
          fontWeight: 600,
          padding: '24px 24px 12px',
        },
      },
    },

    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '12px 24px 24px',
        },
      },
    },

    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: '16px 24px 24px',
          gap: 12,
        },
      },
    },

    MuiBackdrop: {
      styleOverrides: {
        root: {
          backgroundColor: alpha(neonColors.base.black, 0.75),
          backdropFilter: 'blur(8px)',
          '&.MuiBackdrop-invisible': {
            backgroundColor: 'transparent',
            backdropFilter: 'none',
          },
        },
      },
    },

    // =========================================================================
    // Alerts y Feedback - Con bordes y glows neón
    // =========================================================================
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.large,
          backdropFilter: 'blur(12px)',
          border: 'none',
          borderLeft: '4px solid',
        },
        standardSuccess: {
          background: `linear-gradient(90deg, ${alpha(stateColors.success.main, 0.15)}, ${alpha(stateColors.success.main, 0.05)})`,
          borderLeftColor: stateColors.success.main,
          boxShadow: 'none',
          '& .MuiAlert-icon': {
            color: stateColors.success.main,
            filter: 'none',
          },
        },
        standardError: {
          background: `linear-gradient(90deg, ${alpha(stateColors.error.main, 0.15)}, ${alpha(stateColors.error.main, 0.05)})`,
          borderLeftColor: stateColors.error.main,
          boxShadow: 'none',
          '& .MuiAlert-icon': {
            color: stateColors.error.main,
            filter: 'none',
          },
        },
        standardWarning: {
          background: `linear-gradient(90deg, ${alpha(stateColors.warning.main, 0.15)}, ${alpha(stateColors.warning.main, 0.05)})`,
          borderLeftColor: stateColors.warning.main,
          boxShadow: 'none',
          '& .MuiAlert-icon': {
            color: stateColors.warning.main,
            filter: 'none',
          },
        },
        standardInfo: {
          background: `linear-gradient(90deg, ${alpha(stateColors.info.main, 0.15)}, ${alpha(stateColors.info.main, 0.05)})`,
          borderLeftColor: stateColors.info.main,
          boxShadow: 'none',
          '& .MuiAlert-icon': {
            color: stateColors.info.main,
            filter: 'none',
          },
        },
      },
    },

    MuiSnackbar: {
      styleOverrides: {
        root: {
          '& .MuiPaper-root': {
            borderRadius: borderRadius.large,
          },
        },
      },
    },

    // =========================================================================
    // Chips y Badges - Con gradientes y glow
    // =========================================================================
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: borderRadius.xxl,
          transition: 'all 0.3s ease',
        },
        filled: {
          '&.MuiChip-colorPrimary': {
            background: gradients.ocean,
            color: neonColors.primary.contrastText,
            boxShadow: `0 2px 6px rgba(0, 0, 0, 0.35)`,
            '&:hover': {
              boxShadow: `0 2px 6px rgba(0, 0, 0, 0.35)`,
            },
          },
          '&.MuiChip-colorSecondary': {
            background: gradients.neonPrimary,
            color: neonColors.primary.contrastText,
            boxShadow: `0 2px 6px rgba(0, 0, 0, 0.35)`,
          },
          '&.MuiChip-colorSuccess': {
            background: `linear-gradient(135deg, ${stateColors.success.main}, ${stateColors.success.dark})`,
            boxShadow: `0 2px 6px rgba(0, 0, 0, 0.35)`,
          },
          '&.MuiChip-colorWarning': {
            background: `linear-gradient(135deg, ${stateColors.warning.main}, ${stateColors.warning.light})`,
            boxShadow: `0 2px 6px rgba(0, 0, 0, 0.35)`,
          },
          '&.MuiChip-colorError': {
            background: gradients.sunset,
            boxShadow: `0 2px 6px rgba(0, 0, 0, 0.35)`,
          },
        },
        outlined: {
          borderWidth: 2,
          '&.MuiChip-colorPrimary': {
            borderColor: neonColors.primary.main,
            '&:hover': {
              backgroundColor: darkModeColors.action.hover,
              boxShadow: neonEffects.glow.cyanSubtle,
            },
          },
        },
      },
    },

    MuiBadge: {
      styleOverrides: {
        badge: {
          fontWeight: 700,
          boxShadow: 'none',
        },
      },
    },

    // =========================================================================
    // Tabs - Con indicador neón animado
    // =========================================================================
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          borderRadius: '3px 3px 0 0',
          background: gradients.ocean,
          boxShadow: 'none',
        },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          minHeight: 48,
          transition: 'all 0.2s ease',
          '&.Mui-selected': {
            color: neonColors.primary.main,
            fontWeight: 600,
            textShadow: 'none',
          },
          '&:hover': {
            color: neonColors.primary.light,
            backgroundColor: alpha(neonColors.primary.main, 0.08),
          },
        },
      },
    },

    // =========================================================================
    // Tooltips
    // =========================================================================
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          background: gradients.darkCard,
          backdropFilter: 'blur(12px)',
          fontSize: '0.8rem',
          fontWeight: 500,
          padding: '10px 16px',
          borderRadius: borderRadius.medium,
          boxShadow: `${shadows.dark.md}`,
          border: `1px solid ${darkModeColors.border}`,
        },
        arrow: {
          color: darkSurfaces.midnightBlue,
        },
      },
    },

    // =========================================================================
    // Progress indicators - Con glow neón
    // =========================================================================
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.small,
          backgroundColor: alpha(neonColors.primary.main, 0.15),
          height: 6,
        },
        bar: {
          borderRadius: borderRadius.small,
          background: gradients.ocean,
          boxShadow: 'none',
        },
      },
    },

    MuiCircularProgress: {
      styleOverrides: {
        root: {
          color: neonColors.primary.main,
          filter: 'none',
        },
      },
    },

    // =========================================================================
    // Switches y Checkboxes - Con glow
    // =========================================================================
    MuiSwitch: {
      styleOverrides: {
        root: {
          '& .MuiSwitch-switchBase.Mui-checked': {
            color: neonColors.primary.main,
            '& + .MuiSwitch-track': {
              backgroundColor: neonColors.primary.main,
              boxShadow: 'none',
            },
          },
          '& .MuiSwitch-thumb': {
            boxShadow: 'none',
          },
        },
      },
    },

    MuiCheckbox: {
      styleOverrides: {
        root: {
          '&.Mui-checked': {
            color: neonColors.primary.main,
            filter: 'none',
          },
        },
      },
    },

    MuiRadio: {
      styleOverrides: {
        root: {
          '&.Mui-checked': {
            color: neonColors.primary.main,
            filter: 'none',
          },
        },
      },
    },

    // =========================================================================
    // Skeleton - Con shimmer effect
    // =========================================================================
    MuiSkeleton: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#FFFFFF', 0.06),
          '&::after': {
            background: `linear-gradient(90deg, transparent, ${alpha(neonColors.primary.main, 0.1)}, transparent)`,
          },
        },
      },
    },

    // =========================================================================
    // Divider
    // =========================================================================
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: darkModeColors.divider,
        },
      },
    },

    // =========================================================================
    // Avatar - Con glow
    // =========================================================================
    MuiAvatar: {
      styleOverrides: {
        root: {
          background: gradients.ocean,
          color: neonColors.primary.contrastText,
          fontWeight: 600,
          boxShadow: 'none',
        },
      },
    },

    // =========================================================================
    // Menu
    // =========================================================================
    MuiMenu: {
      defaultProps: {
        // Avoid dark global backdrop when opening Select menus.
        BackdropProps: {
          invisible: true,
        },
      },
      styleOverrides: {
        paper: {
          borderRadius: borderRadius.large,
          background: gradients.darkCard,
          backdropFilter: 'blur(16px)',
          boxShadow: `${shadows.dark.lg}, ${shadows.dark.neon}`,
          border: `1px solid ${darkModeColors.border}`,
        },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.medium,
          margin: '4px 8px',
          padding: '10px 16px',
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: darkModeColors.action.hover,
          },
          '&.Mui-selected': {
            backgroundColor: alpha(neonColors.primary.main, 0.12),
            '&:hover': {
              backgroundColor: alpha(neonColors.primary.main, 0.16),
            },
          },
        },
      },
    },

    // =========================================================================
    // Breadcrumbs
    // =========================================================================
    MuiBreadcrumbs: {
      styleOverrides: {
        root: {
          '& .MuiLink-root': {
            color: darkModeColors.text.secondary,
            textDecoration: 'none',
            transition: 'all 0.2s ease',
            '&:hover': {
              color: neonColors.primary.main,
              textShadow: 'none',
            },
          },
        },
        separator: {
          color: alpha(neonAccents.vividPurple, 0.5),
        },
      },
    },

    // =========================================================================
    // Link
    // =========================================================================
    MuiLink: {
      styleOverrides: {
        root: {
          color: neonColors.secondary.main,
          textDecorationColor: alpha(neonColors.secondary.main, 0.4),
          transition: 'all 0.2s ease',
          '&:hover': {
            textDecorationColor: neonColors.secondary.main,
            textShadow: 'none',
          },
        },
      },
    },

    // =========================================================================
    // Accordion
    // =========================================================================
    MuiAccordion: {
      styleOverrides: {
        root: {
          background: gradients.darkCard,
          borderRadius: `${borderRadius.large}px !important`,
          border: `1px solid ${darkModeColors.border}`,
          marginBottom: 8,
          '&:before': {
            display: 'none',
          },
          '&.Mui-expanded': {
            borderColor: alpha(neonColors.primary.main, 0.4),
            boxShadow: shadows.dark.neon,
          },
        },
      },
    },

    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.large,
          '&:hover': {
            backgroundColor: alpha(neonColors.primary.main, 0.08),
          },
        },
      },
    },

    // =========================================================================
    // Slider
    // =========================================================================
    MuiSlider: {
      styleOverrides: {
        root: {
          '& .MuiSlider-thumb': {
            boxShadow: 'none',
            '&:hover, &.Mui-focusVisible': {
              boxShadow: 'none',
            },
          },
          '& .MuiSlider-track': {
            background: gradients.ocean,
            boxShadow: 'none',
          },
          '& .MuiSlider-rail': {
            backgroundColor: alpha(neonAccents.vividPurple, 0.3),
          },
        },
      },
    },

    // =========================================================================
    // Rating
    // =========================================================================
    MuiRating: {
      styleOverrides: {
        iconFilled: {
          color: neonAccents.sunsetOrange,
          filter: `drop-shadow(0 0 4px ${alpha(neonAccents.sunsetOrange, 0.6)})`,
        },
      },
    },

    // =========================================================================
    // ToggleButton
    // =========================================================================
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderColor: darkModeColors.border,
          '&.Mui-selected': {
            backgroundColor: alpha(neonColors.primary.main, 0.14),
            borderColor: neonColors.primary.main,
            boxShadow: neonEffects.glow.cyanSubtle,
            '&:hover': {
              backgroundColor: alpha(neonColors.primary.main, 0.16),
            },
          },
        },
      },
    },
  },
});

export default darkTheme;
