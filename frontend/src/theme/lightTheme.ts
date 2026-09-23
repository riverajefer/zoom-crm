import { createTheme, alpha } from '@mui/material/styles';
import {
  neonColors,
  neonAccents,
  stateColors,
  lightModeColors,
  lightSurfaces,
  neonEffects,
  gradients,
  borderRadius,
  shadows,
} from './colors';

/**
 * Tema Claro - Estilo Neón Elegante con Degradados Sutiles
 * Efectos neón suaves pero presentes, degradados elegantes
 */
export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    // En claro el lima no se lee sobre blanco: se usa un verde más oscuro
    primary: {
      ...neonColors.primary,
      main: '#5E8A12',
      dark: '#4A6E0C',
      contrastText: '#FFFFFF',
    },
    secondary: {
      ...neonColors.secondary,
      light: neonAccents.vividPurple,
    },
    success: {
      ...stateColors.success,
      contrastText: '#FFFFFF',
    },
    warning: stateColors.warning,
    error: {
      ...stateColors.error,
      main: '#EF4444',
    },
    info: stateColors.info,
    background: {
      default: lightModeColors.background.default,
      paper: lightModeColors.background.paper,
    },
    text: lightModeColors.text,
    divider: lightModeColors.divider,
    action: lightModeColors.action,
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
      color: neonColors.base.voidBlack,
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
    shadows.light.sm,
    shadows.light.sm,
    shadows.light.md,
    shadows.light.md,
    shadows.light.md,
    shadows.light.lg,
    shadows.light.lg,
    shadows.light.lg,
    shadows.light.lg,
    shadows.light.lg,
    shadows.light.lg,
    shadows.light.lg,
    shadows.light.lg,
    shadows.light.lg,
    shadows.light.lg,
    shadows.light.lg,
    shadows.light.lg,
    shadows.light.lg,
    shadows.light.lg,
    shadows.light.lg,
    shadows.light.lg,
    shadows.light.lg,
    shadows.light.lg,
    shadows.light.lg,
  ],

  components: {
    // =========================================================================
    // CssBaseline - Estilos globales
    // =========================================================================
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          scrollBehavior: 'smooth',
        },
        body: {
          background: gradients.lightMesh,
          backgroundAttachment: 'fixed',
          scrollbarColor: `${alpha(neonColors.primary.main, 0.3)} transparent`,
          '&::-webkit-scrollbar': {
            width: 10,
            height: 10,
          },
          '&::-webkit-scrollbar-thumb': {
            background: `linear-gradient(180deg, ${neonColors.primary.main} 0%, ${neonAccents.vividPurple} 100%)`,
            borderRadius: 5,
            '&:hover': {
              background: `linear-gradient(180deg, ${neonColors.primary.dark} 0%, ${neonAccents.electricViolet} 100%)`,
            },
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: alpha(lightSurfaces.mist, 0.5),
          },
        },
        '::selection': {
          backgroundColor: alpha(neonColors.primary.main, 0.2),
          color: neonColors.base.voidBlack,
        },
      },
    },

    // =========================================================================
    // Botones - Con sombras de color y hover elegante
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
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
            transition: 'left 0.5s ease',
          },
          '&:hover::before': {
            left: '100%',
          },
        },
        contained: {
          boxShadow: `0 4px 14px ${alpha(neonColors.primary.main, 0.3)}`,
          '&:hover': {
            transform: 'translateY(-3px)',
            boxShadow: `0 8px 24px ${alpha(neonColors.primary.main, 0.45)}, 0 4px 12px ${alpha(neonColors.primary.main, 0.25)}`,
          },
          '&:active': {
            transform: 'translateY(-1px)',
            boxShadow: `0 4px 12px ${alpha(neonColors.primary.main, 0.35)}`,
          },
          '&.Mui-disabled': {
            background: alpha(neonColors.primary.main, 0.12),
            color: alpha(lightModeColors.text.primary, 0.4),
            boxShadow: 'none',
          },
        },
        containedPrimary: {
          background: `linear-gradient(135deg, ${neonColors.primary.main} 0%, ${neonColors.primary.dark} 100%)`,
          color: '#FFFFFF',
          fontWeight: 600,
          '&:hover': {
            background: `linear-gradient(135deg, ${neonColors.primary.light} 0%, ${neonColors.primary.main} 100%)`,
            boxShadow: `0 8px 28px ${alpha(neonColors.primary.main, 0.5)}, 0 4px 14px ${alpha(neonColors.primary.main, 0.3)}`,
          },
          '&:active': {
            background: `linear-gradient(135deg, ${neonColors.primary.dark} 0%, ${neonColors.primary.main} 100%)`,
          },
        },
        containedSecondary: {
          background: `linear-gradient(135deg, ${neonAccents.vividPurple} 0%, ${neonAccents.electricViolet} 100%)`,
          color: '#FFFFFF',
          fontWeight: 600,
          '&:hover': {
            background: `linear-gradient(135deg, ${alpha(neonAccents.vividPurple, 0.9)} 0%, ${neonAccents.vividPurple} 100%)`,
            boxShadow: `0 8px 28px ${alpha(neonAccents.vividPurple, 0.45)}, 0 4px 14px ${alpha(neonAccents.vividPurple, 0.25)}`,
          },
        },
        containedSuccess: {
          background: `linear-gradient(135deg, ${stateColors.success.main} 0%, ${stateColors.success.dark} 100%)`,
          color: '#FFFFFF',
          fontWeight: 600,
          '&:hover': {
            background: `linear-gradient(135deg, ${stateColors.success.light} 0%, ${stateColors.success.main} 100%)`,
            boxShadow: `0 8px 28px ${alpha(stateColors.success.main, 0.45)}`,
          },
        },
        containedError: {
          background: `linear-gradient(135deg, #EF4444 0%, #DC2626 100%)`,
          color: '#FFFFFF',
          fontWeight: 600,
          '&:hover': {
            background: `linear-gradient(135deg, #F87171 0%, #EF4444 100%)`,
            boxShadow: `0 8px 28px ${alpha('#EF4444', 0.45)}, 0 4px 14px ${alpha('#EF4444', 0.25)}`,
          },
        },
        containedWarning: {
          background: `linear-gradient(135deg, ${stateColors.warning.main} 0%, ${stateColors.warning.dark} 100%)`,
          color: '#FFFFFF',
          fontWeight: 600,
          '&:hover': {
            background: `linear-gradient(135deg, ${stateColors.warning.light} 0%, ${stateColors.warning.main} 100%)`,
            boxShadow: `0 8px 28px ${alpha(stateColors.warning.main, 0.45)}`,
          },
        },
        outlined: {
          borderWidth: 2,
          borderColor: neonColors.primary.main,
          '&:hover': {
            borderWidth: 2,
            backgroundColor: alpha(neonColors.primary.main, 0.08),
            boxShadow: `0 0 12px ${alpha(neonColors.primary.main, 0.2)}`,
          },
        },
        outlinedPrimary: {
          '&:hover': {
            borderColor: neonColors.primary.dark,
          },
        },
        outlinedSecondary: {
          borderColor: neonAccents.vividPurple,
          '&:hover': {
            borderColor: neonAccents.electricViolet,
            backgroundColor: alpha(neonAccents.vividPurple, 0.08),
          },
        },
        text: {
          '&:hover': {
            backgroundColor: alpha(neonColors.primary.main, 0.08),
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
            backgroundColor: alpha(neonColors.primary.main, 0.1),
            transform: 'scale(1.1)',
          },
        },
      },
    },

    MuiFab: {
      styleOverrides: {
        root: {
          background: gradients.ocean,
          boxShadow: shadows.light.neon,
          '&:hover': {
            background: gradients.ocean,
            boxShadow: shadows.light.neonHover,
            transform: 'scale(1.1)',
          },
        },
      },
    },

    // =========================================================================
    // Inputs y Forms
    // =========================================================================
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            transition: 'all 0.3s ease',
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(neonColors.primary.main, 0.5),
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: neonColors.primary.main,
              borderWidth: 2,
              boxShadow: `0 0 0 3px ${alpha(neonColors.primary.main, 0.15)}`,
            },
          },
        },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.medium,
          backgroundColor: neonColors.base.white,
          transition: 'all 0.3s ease',
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha(neonColors.primary.main, 0.5),
          },
          '&.Mui-focused': {
            backgroundColor: neonColors.base.white,
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: neonColors.primary.main,
              boxShadow: `0 0 0 3px ${alpha(neonColors.primary.main, 0.12)}`,
            },
          },
        },
        notchedOutline: {
          borderColor: lightModeColors.border,
          transition: 'all 0.3s ease',
        },
      },
    },

    MuiInputLabel: {
      styleOverrides: {
        root: {
          '&.Mui-focused': {
            color: neonColors.primary.main,
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
          background: gradients.lightCard,
          boxShadow: `${shadows.light.lg}, ${shadows.light.neon}`,
          border: `1px solid ${alpha(neonColors.primary.main, 0.15)}`,
        },
        option: {
          borderRadius: borderRadius.small,
          margin: '2px 8px',
          '&:hover': {
            backgroundColor: alpha(neonColors.primary.main, 0.08),
          },
          '&[aria-selected="true"]': {
            backgroundColor: alpha(neonColors.primary.main, 0.12),
          },
        },
      },
    },

    // =========================================================================
    // Cards y Surfaces - Con tintes sutiles de color
    // =========================================================================
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.xl,
          background: gradients.lightCard,
          border: `1px solid ${lightModeColors.border}`,
          boxShadow: shadows.light.md,
          transition: 'all 0.3s ease',
          '&:hover': {
            borderColor: alpha(neonColors.primary.main, 0.3),
            boxShadow: `${shadows.light.lg}, ${shadows.light.neon}`,
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
          color: neonColors.base.voidBlack,
        },
        subheader: {
          color: lightModeColors.text.secondary,
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
          background: gradients.lightCard,
        },
        rounded: {
          borderRadius: borderRadius.large,
        },
        elevation1: {
          boxShadow: shadows.light.sm,
          border: `1px solid ${lightModeColors.border}`,
        },
        elevation2: {
          boxShadow: shadows.light.md,
          border: `1px solid ${lightModeColors.border}`,
        },
        elevation3: {
          boxShadow: `${shadows.light.lg}, ${shadows.light.neon}`,
          border: `1px solid ${alpha(neonColors.primary.main, 0.1)}`,
        },
      },
    },

    // =========================================================================
    // Tables y DataGrid
    // =========================================================================
    MuiTableContainer: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.large,
          border: `1px solid ${lightModeColors.border}`,
          overflow: 'hidden',
        },
      },
    },

    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            background: gradients.tableHeaderLight,
            fontWeight: 600,
            color: neonColors.secondary.main,
            borderBottom: `2px solid ${alpha(neonColors.primary.main, 0.2)}`,
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
          '&:nth-of-type(odd)': {
            backgroundColor: neonColors.base.white,
          },
          '&:nth-of-type(even)': {
            backgroundColor: lightSurfaces.snow,
          },
          '&:hover': {
            backgroundColor: alpha(neonColors.primary.main, 0.06),
          },
          '&.Mui-selected': {
            background: `linear-gradient(90deg, ${alpha(neonColors.primary.main, 0.1)}, ${alpha(neonAccents.vividPurple, 0.05)})`,
            borderLeft: `3px solid ${neonColors.primary.main}`,
            '&:hover': {
              background: `linear-gradient(90deg, ${alpha(neonColors.primary.main, 0.12)}, ${alpha(neonAccents.vividPurple, 0.08)})`,
            },
          },
        },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${lightModeColors.divider}`,
          padding: '16px',
        },
      },
    },

    MuiTablePagination: {
      styleOverrides: {
        root: {
          background: gradients.lightCard,
          borderTop: `1px solid ${lightModeColors.divider}`,
        },
      },
    },

    // =========================================================================
    // Navigation - Sidebar con tinte elegante
    // =========================================================================
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: `1px solid ${lightModeColors.border}`,
          background: `linear-gradient(180deg, ${lightSurfaces.cloud} 0%, ${lightSurfaces.lavenderTint} 100%)`,
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
            backgroundColor: alpha(neonColors.primary.main, 0.08),
            transform: 'translateX(4px)',
          },
          '&.Mui-selected': {
            background: `linear-gradient(90deg, ${alpha(neonColors.primary.main, 0.12)}, ${alpha(neonAccents.vividPurple, 0.06)})`,
            boxShadow: `0 2px 8px ${alpha(neonColors.primary.main, 0.15)}`,
            '&::before': {
              content: '""',
              position: 'absolute',
              left: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 4,
              height: '60%',
              background: `linear-gradient(180deg, ${neonColors.primary.main}, ${neonAccents.vividPurple})`,
              borderRadius: '0 4px 4px 0',
            },
            '&:hover': {
              backgroundColor: alpha(neonColors.primary.main, 0.15),
              transform: 'translateX(4px)',
            },
            '& .MuiListItemIcon-root': {
              color: neonColors.primary.main,
            },
            '& .MuiListItemText-primary': {
              color: neonColors.primary.dark,
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
          color: lightModeColors.text.secondary,
          transition: 'all 0.2s ease',
        },
      },
    },

    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: shadows.light.sm,
          borderBottom: `1px solid ${lightModeColors.border}`,
          background: `linear-gradient(90deg, ${alpha(neonColors.base.white, 0.95)} 0%, ${alpha(lightSurfaces.cyanTint, 0.9)} 100%)`,
          backdropFilter: 'blur(10px)',
          color: lightModeColors.text.primary,
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
    // Dialogs y Modals
    // =========================================================================
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: borderRadius.xl,
          background: neonEffects.glass.light.background,
          backdropFilter: 'blur(16px)',
          border: `1px solid ${alpha(neonColors.primary.main, 0.15)}`,
          boxShadow: `${shadows.light.lg}, 0 0 40px ${alpha(neonColors.primary.main, 0.1)}`,
        },
      },
    },

    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: '1.25rem',
          fontWeight: 600,
          padding: '24px 24px 12px',
          color: neonColors.base.voidBlack,
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
          backgroundColor: alpha(neonColors.secondary.main, 0.25),
          backdropFilter: 'blur(6px)',
          '&.MuiBackdrop-invisible': {
            backgroundColor: 'transparent',
            backdropFilter: 'none',
          },
        },
      },
    },

    // =========================================================================
    // Alerts y Feedback
    // =========================================================================
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.large,
          border: 'none',
          borderLeft: '4px solid',
        },
        standardSuccess: {
          background: `linear-gradient(90deg, ${alpha(stateColors.success.dark, 0.1)}, ${alpha(stateColors.success.dark, 0.02)})`,
          borderLeftColor: stateColors.success.dark,
          '& .MuiAlert-icon': {
            color: stateColors.success.dark,
          },
        },
        standardError: {
          background: `linear-gradient(90deg, ${alpha('#EF4444', 0.1)}, ${alpha('#EF4444', 0.02)})`,
          borderLeftColor: '#EF4444',
          '& .MuiAlert-icon': {
            color: '#EF4444',
          },
        },
        standardWarning: {
          background: `linear-gradient(90deg, ${alpha(stateColors.warning.dark, 0.1)}, ${alpha(stateColors.warning.dark, 0.02)})`,
          borderLeftColor: stateColors.warning.dark,
          '& .MuiAlert-icon': {
            color: stateColors.warning.dark,
          },
        },
        standardInfo: {
          background: `linear-gradient(90deg, ${alpha(stateColors.info.main, 0.1)}, ${alpha(stateColors.info.main, 0.02)})`,
          borderLeftColor: stateColors.info.main,
          '& .MuiAlert-icon': {
            color: stateColors.info.main,
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
    // Chips y Badges - Con color vibrante
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
            color: neonColors.base.white,
            boxShadow: `0 2px 8px ${alpha(neonColors.primary.main, 0.3)}`,
          },
          '&.MuiChip-colorSecondary': {
            background: gradients.neonPrimary,
            color: neonColors.base.white,
            boxShadow: `0 2px 8px ${alpha(neonAccents.vividPurple, 0.3)}`,
          },
          '&.MuiChip-colorSuccess': {
            background: `linear-gradient(135deg, ${stateColors.success.dark}, ${stateColors.success.main})`,
            color: neonColors.base.white,
            boxShadow: `0 2px 8px ${alpha(stateColors.success.main, 0.3)}`,
          },
          '&.MuiChip-colorWarning': {
            background: `linear-gradient(135deg, ${stateColors.warning.dark}, ${stateColors.warning.main})`,
            boxShadow: `0 2px 8px ${alpha(stateColors.warning.main, 0.3)}`,
          },
          '&.MuiChip-colorError': {
            background: gradients.sunset,
            color: neonColors.base.white,
            boxShadow: `0 2px 8px ${alpha(stateColors.error.main, 0.3)}`,
          },
        },
        outlined: {
          borderWidth: 2,
          '&.MuiChip-colorPrimary': {
            borderColor: neonColors.primary.main,
            '&:hover': {
              backgroundColor: alpha(neonColors.primary.main, 0.08),
            },
          },
        },
      },
    },

    MuiBadge: {
      styleOverrides: {
        badge: {
          fontWeight: 700,
        },
      },
    },

    // =========================================================================
    // Tabs
    // =========================================================================
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          borderRadius: '3px 3px 0 0',
          background: gradients.ocean,
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
          },
          '&:hover': {
            color: neonColors.primary.dark,
            backgroundColor: alpha(neonColors.primary.main, 0.06),
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
          backgroundColor: neonColors.secondary.main,
          fontSize: '0.8rem',
          fontWeight: 500,
          padding: '10px 16px',
          borderRadius: borderRadius.medium,
          boxShadow: shadows.light.md,
        },
        arrow: {
          color: neonColors.secondary.main,
        },
      },
    },

    // =========================================================================
    // Progress indicators
    // =========================================================================
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.small,
          backgroundColor: alpha(neonColors.primary.main, 0.12),
          height: 6,
        },
        bar: {
          borderRadius: borderRadius.small,
          background: gradients.ocean,
        },
      },
    },

    MuiCircularProgress: {
      styleOverrides: {
        root: {
          color: neonColors.primary.main,
        },
      },
    },

    // =========================================================================
    // Switches y Checkboxes
    // =========================================================================
    MuiSwitch: {
      styleOverrides: {
        root: {
          '& .MuiSwitch-switchBase.Mui-checked': {
            color: neonColors.primary.main,
            '& + .MuiSwitch-track': {
              backgroundColor: neonColors.primary.main,
            },
          },
        },
      },
    },

    MuiCheckbox: {
      styleOverrides: {
        root: {
          '&.Mui-checked': {
            color: neonColors.primary.main,
          },
        },
      },
    },

    MuiRadio: {
      styleOverrides: {
        root: {
          '&.Mui-checked': {
            color: neonColors.primary.main,
          },
        },
      },
    },

    // =========================================================================
    // Skeleton
    // =========================================================================
    MuiSkeleton: {
      styleOverrides: {
        root: {
          backgroundColor: alpha(neonColors.secondary.main, 0.08),
        },
      },
    },

    // =========================================================================
    // Divider
    // =========================================================================
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: lightModeColors.divider,
        },
      },
    },

    // =========================================================================
    // Avatar
    // =========================================================================
    MuiAvatar: {
      styleOverrides: {
        root: {
          background: gradients.ocean,
          color: neonColors.base.white,
          fontWeight: 600,
        },
      },
    },

    // =========================================================================
    // Menu
    // =========================================================================
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: borderRadius.large,
          background: gradients.lightCard,
          boxShadow: `${shadows.light.lg}, ${shadows.light.neon}`,
          border: `1px solid ${alpha(neonColors.primary.main, 0.1)}`,
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
            backgroundColor: alpha(neonColors.primary.main, 0.08),
          },
          '&.Mui-selected': {
            background: `linear-gradient(90deg, ${alpha(neonColors.primary.main, 0.12)}, ${alpha(neonAccents.vividPurple, 0.06)})`,
            '&:hover': {
              backgroundColor: alpha(neonColors.primary.main, 0.15),
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
            color: lightModeColors.text.secondary,
            textDecoration: 'none',
            transition: 'all 0.2s ease',
            '&:hover': {
              color: neonColors.primary.main,
            },
          },
        },
        separator: {
          color: alpha(neonColors.secondary.main, 0.4),
        },
      },
    },

    // =========================================================================
    // Link
    // =========================================================================
    MuiLink: {
      styleOverrides: {
        root: {
          color: neonColors.primary.main,
          textDecorationColor: alpha(neonColors.primary.main, 0.4),
          transition: 'all 0.2s ease',
          '&:hover': {
            textDecorationColor: neonColors.primary.main,
            color: neonColors.primary.dark,
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
          background: gradients.lightCard,
          borderRadius: `${borderRadius.large}px !important`,
          border: `1px solid ${lightModeColors.border}`,
          marginBottom: 8,
          '&:before': {
            display: 'none',
          },
          '&.Mui-expanded': {
            borderColor: alpha(neonColors.primary.main, 0.3),
            boxShadow: shadows.light.neon,
          },
        },
      },
    },

    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          borderRadius: borderRadius.large,
          '&:hover': {
            backgroundColor: alpha(neonColors.primary.main, 0.04),
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
            boxShadow: `0 2px 8px ${alpha(neonColors.primary.main, 0.4)}`,
            '&:hover, &.Mui-focusVisible': {
              boxShadow: `0 4px 12px ${alpha(neonColors.primary.main, 0.5)}`,
            },
          },
          '& .MuiSlider-track': {
            background: gradients.ocean,
          },
          '& .MuiSlider-rail': {
            backgroundColor: alpha(neonColors.primary.main, 0.2),
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
        },
      },
    },

    // =========================================================================
    // ToggleButton
    // =========================================================================
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderColor: lightModeColors.border,
          '&.Mui-selected': {
            background: `linear-gradient(135deg, ${alpha(neonColors.primary.main, 0.12)}, ${alpha(neonAccents.vividPurple, 0.08)})`,
            borderColor: neonColors.primary.main,
            '&:hover': {
              backgroundColor: alpha(neonColors.primary.main, 0.15),
            },
          },
        },
      },
    },
  },
});

export default lightTheme;
