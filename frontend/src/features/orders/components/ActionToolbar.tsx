import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Box, Paper, type SxProps, type Theme } from '@mui/material';
import {
  MoreHoriz as MoreHorizIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { ToolbarButton } from './ToolbarButton';

interface ActionToolbarProps {
  /**
   * Los botones, en orden de prioridad: los primeros son los que quedan a la
   * vista cuando no caben todos.
   */
  children: React.ReactNode;
  sx?: SxProps<Theme>;
}

/**
 * Barra de acciones que nunca esconde botones sin avisar.
 *
 * Muestra en una fila los que caben y, si sobran, agrega al final un botón
 * «Más» que despliega el resto debajo. Antes la barra desbordaba con un scroll
 * horizontal sin barra visible y con el contenido centrado, así que lo que se
 * salía por la izquierda quedaba cortado y era inalcanzable.
 *
 * Los botones no se mueven de contenedor ni se duplican: es un solo flex con
 * salto de línea al que se le recorta la altura a una fila. Así los hijos
 * pueden ser cualquier cosa —un botón, un fragmento con tres, un componente
 * que a veces no pinta nada, uno con su propio diálogo— sin que la barra tenga
 * que conocerlos ni desmontarlos al abrir o cerrar.
 */
export const ActionToolbar: React.FC<ActionToolbarProps> = ({
  children,
  sx,
}) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [rowHeight, setRowHeight] = useState<number | null>(null);
  const [hiddenCount, setHiddenCount] = useState(0);

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const buttons = Array.from(row.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );
    if (buttons.length === 0) {
      setRowHeight(null);
      setHiddenCount(0);
      return;
    }

    const firstTop = buttons[0].offsetTop;
    // Con `align-items: stretch`, todos los de la primera fila miden lo mismo.
    setRowHeight(buttons[0].offsetHeight);
    setHiddenCount(buttons.filter((el) => el.offsetTop > firstTop).length);
  }, []);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    measure();

    // El ancho cambia al redimensionar o al abrir el menú lateral; los hijos,
    // cuando llegan permisos o cambia el estado de la orden.
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(row);
    const mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(row, { childList: true });
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [measure]);

  // Lo recortado no se ve, pero seguiría recibiendo el foco con Tab.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const buttons = Array.from(row.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );
    const firstTop = buttons[0]?.offsetTop ?? 0;
    for (const el of buttons) {
      if (!expanded && el.offsetTop > firstTop) el.tabIndex = -1;
      else el.removeAttribute('tabindex');
    }
  });

  const hasOverflow = hiddenCount > 0;
  // Sin nada que desplegar no puede quedar abierta: si la ventana crece y todo
  // vuelve a caber, el botón «Menos» desaparecería dejando el estado colgado.
  const isExpanded = expanded && hasOverflow;

  return (
    <Paper
      elevation={0}
      sx={[
        {
          p: 0,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'flex-start',
          background: (theme) =>
            theme.palette.mode === 'dark'
              ? 'rgba(255, 255, 255, 0.04)'
              : 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(8px)',
          border: (theme) =>
            `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
          overflow: 'hidden',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        ref={rowRef}
        role='toolbar'
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'stretch',
          alignContent: 'flex-start',
          justifyContent: hasOverflow ? 'flex-start' : 'center',
          overflow: 'hidden',
          maxHeight: isExpanded || rowHeight === null ? 'none' : rowHeight,
          // Separador entre botones vecinos. Va por CSS y no como elemento
          // porque los hijos pueden pintar varios botones o ninguno.
          '& > button': { position: 'relative', height: 'auto' },
          '& > button + button::before': {
            content: '""',
            position: 'absolute',
            left: 0,
            top: '25%',
            height: '50%',
            width: '1px',
            bgcolor: 'divider',
            opacity: 0.5,
            display: { xs: 'none', sm: 'block' },
          },
        }}
      >
        {children}
      </Box>

      {hasOverflow && (
        <Box
          sx={{
            flex: 'none',
            display: 'flex',
            height: rowHeight ?? 'auto',
            borderLeft: '1px solid',
            borderColor: 'divider',
          }}
        >
          <ToolbarButton
            icon={isExpanded ? <ExpandLessIcon /> : <MoreHorizIcon />}
            label={isExpanded ? 'Menos' : 'Más'}
            secondaryLabel={
              isExpanded
                ? 'Ocultar'
                : `${hiddenCount} ${hiddenCount === 1 ? 'acción' : 'acciones'}`
            }
            onClick={() => setExpanded((prev) => !prev)}
            tooltip={
              isExpanded
                ? 'Ocultar las acciones adicionales'
                : `Ver ${hiddenCount} ${hiddenCount === 1 ? 'acción más' : 'acciones más'}`
            }
          />
        </Box>
      )}
    </Paper>
  );
};
