import { SxProps, Theme, alpha } from '@mui/material';

/**
 * Estilos del DataGrid - Estilo Neón Moderno
 * Adaptativo para modo claro y oscuro con efectos neón sutiles
 */
export const dataGridStyles: SxProps<Theme> = {
  border: 'none',
  borderRadius: 2,

  // Headers con estilo mejorado y más elegante
  '& .MuiDataGrid-columnHeaders': {
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? alpha(theme.palette.primary.main, 0.08)
        : '#1D201C',
    color: (theme) =>
      theme.palette.mode === 'light'
        ? theme.palette.text.primary
        : theme.palette.text.secondary,
    fontWeight: 800,
    fontSize: '0.9rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: (theme) =>
      theme.palette.mode === 'light' ? '2px solid' : '1px solid',
    borderColor: (theme) =>
      theme.palette.mode === 'light'
        ? theme.palette.primary.main
        : theme.palette.divider,
    minHeight: { xs: '44px !important', sm: '56px !important' },
    boxShadow: (theme) =>
      theme.palette.mode === 'light'
        ? '0 2px 4px rgba(0, 0, 0, 0.05)'
        : 'none',
  },

  '& .MuiDataGrid-columnHeaderTitle': {
    fontWeight: 700,
    letterSpacing: '0.05em',
    fontSize: { xs: '0.7rem', sm: '0.85rem' },
  },

  '& .MuiDataGrid-columnSeparator': {
    color: (theme) =>
      theme.palette.mode === 'light'
        ? alpha(theme.palette.secondary.main, 0.2)
        : theme.palette.divider,
  },

  // Celdas con transiciones suaves y padding responsive
  '& .MuiDataGrid-cell': {
    borderBottom: '1px solid',
    borderColor: 'divider',
    display: 'flex',
    alignItems: 'center',
    padding: { xs: '6px 8px', sm: '8px 16px' },
    fontSize: { xs: '0.8rem', sm: '0.875rem' },
    transition: 'all 0.2s ease',
    position: 'relative' as any,
    zIndex: 1,
    '&:focus': {
      outline: 'none',
    },
    '&:focus-within': {
      outline: 'none',
    },
  },

  // Filas con hover mejorado
  '& .MuiDataGrid-row': {
    transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
    '&:hover': {
      cursor: 'pointer',
      boxShadow: (theme) =>
        theme.palette.mode === 'light'
          ? `inset 3px 0 0 ${theme.palette.primary.main}`
          : `inset 3px 0 0 ${theme.palette.primary.light}`,
    },
    '&.Mui-selected': {
      backgroundColor: (theme) =>
        theme.palette.mode === 'light'
          ? alpha(theme.palette.primary.main, 0.12)
          : alpha(theme.palette.primary.main, 0.14),
      '&:hover': {
        backgroundColor: (theme) =>
          theme.palette.mode === 'light'
            ? alpha(theme.palette.primary.main, 0.16)
            : alpha(theme.palette.primary.main, 0.18),
      },
    },
  },

  // Efecto cebra mejorado (filas pares/impares)
  '& .MuiDataGrid-row:nth-of-type(odd)': {
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? theme.palette.background.paper
        : alpha(theme.palette.background.default, 0.4),
    '&:hover': {
      backgroundColor: (theme) =>
        theme.palette.mode === 'light'
          ? alpha(theme.palette.primary.main, 0.1)
          : alpha('#FFFFFF', 0.05),
    },
  },

  '& .MuiDataGrid-row:nth-of-type(even)': {
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? alpha(theme.palette.grey[100], 0.5)
        : alpha('#FFFFFF', 0.025),
    '&:hover': {
      backgroundColor: (theme) =>
        theme.palette.mode === 'light'
          ? alpha(theme.palette.primary.main, 0.1)
          : alpha('#FFFFFF', 0.05),
    },
  },

  // Fila atrasada — entrega vencida y orden no finalizada
  '& .MuiDataGrid-row.row-overdue': {
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? alpha(theme.palette.error.light, 0.15)
        : alpha(theme.palette.error.dark, 0.25),
    borderLeft: (theme) => `4px solid ${theme.palette.error.main}`,
    '&:hover': {
      backgroundColor: (theme) =>
        theme.palette.mode === 'light'
          ? alpha(theme.palette.error.light, 0.25)
          : alpha(theme.palette.error.dark, 0.35),
      transform: 'translateX(2px)',
    },
  },

  // Fila entrega hoy — se entrega el día de hoy y orden no finalizada
  '& .MuiDataGrid-row.row-due-today': {
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? alpha(theme.palette.info.light, 0.15)
        : alpha(theme.palette.info.dark, 0.25),
    borderLeft: (theme) => `4px solid ${theme.palette.info.main}`,
    '&:hover': {
      backgroundColor: (theme) =>
        theme.palette.mode === 'light'
          ? alpha(theme.palette.info.light, 0.25)
          : alpha(theme.palette.info.dark, 0.35),
      transform: 'translateX(2px)',
    },
  },

  // Fila anticipo pendiente — anticipo esperando aprobación de Caja
  '& .MuiDataGrid-row.row-advance-pending': {
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? alpha(theme.palette.warning.light, 0.15)
        : alpha(theme.palette.warning.dark, 0.25),
    borderLeft: (theme) => `4px solid ${theme.palette.warning.main}`,
    '&:hover': {
      backgroundColor: (theme) =>
        theme.palette.mode === 'light'
          ? alpha(theme.palette.warning.light, 0.25)
          : alpha(theme.palette.warning.dark, 0.35),
      transform: 'translateX(2px)',
    },
  },

  // Fila anticipo rechazado — anticipo rechazado por Caja
  '& .MuiDataGrid-row.row-advance-rejected': {
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? alpha(theme.palette.error.light, 0.12)
        : alpha(theme.palette.error.dark, 0.2),
    borderLeft: (theme) => `4px solid ${theme.palette.error.main}`,
    '&:hover': {
      backgroundColor: (theme) =>
        theme.palette.mode === 'light'
          ? alpha(theme.palette.error.light, 0.22)
          : alpha(theme.palette.error.dark, 0.3),
      transform: 'translateX(2px)',
    },
  },

  // Fila ANULADA — orden cancelada definitivamente
  '& .MuiDataGrid-row.row-anulado': {
    opacity: 0.55,
    borderLeft: (theme) => `4px solid ${theme.palette.error.main}`,
    textDecoration: 'none',
    '&:hover': {
      opacity: 0.75,
      transform: 'translateX(2px)',
    },
  },

  // Footer
  '& .MuiDataGrid-footerContainer': {
    borderTop: '1px solid',
    borderColor: 'divider',
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? alpha(theme.palette.primary.light, 0.05)
        : alpha(theme.palette.secondary.main, 0.1),
  },

  // Pagination responsive
  '& .MuiTablePagination-root': {
    color: 'text.secondary',
    fontSize: { xs: '0.75rem', sm: '0.875rem' },
    '& .MuiTablePagination-selectLabel': {
      display: { xs: 'none', sm: 'block' },
      fontSize: { xs: '0.75rem', sm: '0.875rem' },
    },
    '& .MuiTablePagination-displayedRows': {
      fontSize: { xs: '0.75rem', sm: '0.875rem' },
    },
    '& .MuiTablePagination-select': {
      fontSize: { xs: '0.75rem', sm: '0.875rem' },
    },
    '& .MuiTablePagination-toolbar': {
      minHeight: { xs: 40, sm: 52 },
      paddingLeft: { xs: 1, sm: 2 },
      paddingRight: { xs: 1, sm: 2 },
    },
  },

  '& .MuiTablePagination-selectIcon': {
    color: 'text.secondary',
  },

  // Checkboxes con estilo neón
  '& .MuiCheckbox-root': {
    color: (theme) =>
      theme.palette.mode === 'light'
        ? alpha(theme.palette.secondary.main, 0.5)
        : alpha(theme.palette.primary.main, 0.5),
    '&.Mui-checked': {
      color: 'primary.main',
    },
  },

  // No rows overlay
  '& .MuiDataGrid-overlay': {
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? alpha(theme.palette.background.paper, 0.9)
        : alpha(theme.palette.background.paper, 0.8),
    backdropFilter: 'blur(4px)',
  },

  // Overlay de carga: fondo opaco y por encima de las filas para que no se
  // vean registros montados unos sobre otros mientras cambia de página
  '& .MuiDataGrid-overlayWrapper': {
    zIndex: 4,
    backgroundColor: 'background.paper',
  },
  '& .MuiDataGrid-overlayWrapperInner': {
    backgroundColor: 'background.paper',
  },

  // Virtual scroller
  '& .MuiDataGrid-virtualScroller': {
    backgroundColor: 'background.paper',
  },

  // Ensure sticky columns position relative to render zone
  '& .MuiDataGrid-virtualScrollerRenderZone': {
    position: 'relative',
  },

  '& .all-columns-header': {
    backgroundColor: (theme) => theme.palette.background.default,
  },

  // Columnas pegajosas (row number + Nº Orden)
  '& .sticky-column-row-number': {
    position: 'sticky !important' as any,
    left: '0px !important',
    zIndex: '5 !important',
    backgroundColor: 'inherit',
  },

  '& .MuiDataGrid-columnHeader.sticky-column-row-number': {
    position: 'sticky !important' as any,
    left: '0px !important',
    zIndex: '10 !important',
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? '#EEF6DD'
        : '#1D201C',
  },

  '& .sticky-column-order-number': {
    position: 'sticky !important' as any,
    left: '70px !important',
    zIndex: '4 !important',
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? '#EEF6DD'
        : '#1D201C',
    boxShadow: '2px 0 4px rgba(0,0,0,0.08)',
  },

  '& .MuiDataGrid-columnHeader.sticky-column-order-number': {
    position: 'sticky !important' as any,
    left: '70px !important',
    zIndex: '10 !important',
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? '#EEF6DD'
        : '#1D201C',
    boxShadow: '2px 0 4px rgba(0,0,0,0.08)',
  },

  // Fondos OPACOS para sticky columns en filas normales (evitan transparencia al hacer scroll)
  '& .MuiDataGrid-row:nth-of-type(odd) .sticky-column-row-number, & .MuiDataGrid-row:nth-of-type(odd) .sticky-column-order-number': {
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? theme.palette.background.paper
        : '#161816',
  },

  '& .MuiDataGrid-row:nth-of-type(even) .sticky-column-row-number, & .MuiDataGrid-row:nth-of-type(even) .sticky-column-order-number': {
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? '#f5f5f5'
        : '#1B1D1B',
  },

  // Fondos opacos para filas con estados especiales
  '& .MuiDataGrid-row.row-overdue .sticky-column-row-number, & .MuiDataGrid-row.row-overdue .sticky-column-order-number': {
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? '#fce4ec'
        : '#3d1c1c',
  },

  '& .MuiDataGrid-row.row-due-today .sticky-column-row-number, & .MuiDataGrid-row.row-due-today .sticky-column-order-number': {
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? '#e3f2fd'
        : '#1c2a3d',
  },

  '& .MuiDataGrid-row.row-advance-pending .sticky-column-row-number, & .MuiDataGrid-row.row-advance-pending .sticky-column-order-number': {
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? '#fff3e0'
        : '#3d2e1c',
  },

  '& .MuiDataGrid-row.row-advance-rejected .sticky-column-row-number, & .MuiDataGrid-row.row-advance-rejected .sticky-column-order-number': {
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? '#fce4ec'
        : '#3d1c1c',
  },

  '& .MuiDataGrid-row.row-anulado .sticky-column-row-number, & .MuiDataGrid-row.row-anulado .sticky-column-order-number': {
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? '#f5f5f5'
        : '#2a1c1c',
  },

  // Hover en sticky columns: fondo opaco consistente
  '& .MuiDataGrid-row:hover .sticky-column-row-number, & .MuiDataGrid-row:hover .sticky-column-order-number': {
    backgroundColor: (theme) =>
      theme.palette.mode === 'light'
        ? '#EEF6DD'
        : '#242623',
  },

  // Menu de columnas
  '& .MuiDataGrid-menuIcon': {
    color: (theme) =>
      theme.palette.mode === 'light'
        ? theme.palette.secondary.main
        : theme.palette.primary.light,
  },

  // Sorting icons
  '& .MuiDataGrid-sortIcon': {
    color: (theme) =>
      theme.palette.mode === 'light'
        ? theme.palette.primary.main
        : theme.palette.primary.light,
  },
};

/**
 * Estilos del contenedor Paper - Glassmorphism en modo oscuro
 */
export const paperStyles: SxProps<Theme> = {
  width: '100%',
  overflow: 'hidden',
  borderRadius: 3,
  backgroundColor: (theme) =>
    theme.palette.mode === 'light'
      ? theme.palette.background.paper
      : alpha(theme.palette.background.paper, 0.7),
  backdropFilter: (theme) =>
    theme.palette.mode === 'dark' ? 'blur(10px)' : 'none',
  border: '1px solid',
  borderColor: (theme) =>
    theme.palette.mode === 'light'
      ? alpha(theme.palette.secondary.main, 0.1)
      : theme.palette.divider,
  boxShadow: (theme) =>
    theme.palette.mode === 'light'
      ? '0 4px 20px rgba(0, 0, 0, 0.08)'
      : `0 4px 20px rgba(0, 0, 0, 0.3)`,
  transition: 'all 0.3s ease',
  '&:hover': {
    boxShadow: (theme) =>
      theme.palette.mode === 'light'
        ? '0 6px 24px rgba(0, 0, 0, 0.1)'
        : `0 6px 24px rgba(0, 0, 0, 0.4)`,
  },
};

/**
 * Estilos para el toolbar del DataGrid
 */
export const toolbarStyles: SxProps<Theme> = {
  padding: 2,
  display: 'flex',
  gap: 2,
  alignItems: 'center',
  borderBottom: '1px solid',
  borderColor: 'divider',
  backgroundColor: (theme) =>
    theme.palette.mode === 'light'
      ? alpha(theme.palette.background.paper, 0.8)
      : alpha(theme.palette.background.paper, 0.5),
  backdropFilter: 'blur(8px)',
};
