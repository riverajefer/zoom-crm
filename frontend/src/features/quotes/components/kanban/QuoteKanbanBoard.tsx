import React, { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { Settings as SettingsIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useQueryClient } from '@tanstack/react-query';
import { QuoteKanbanColumn } from './QuoteKanbanColumn';
import { QuoteKanbanCard } from './QuoteKanbanCard';
import { QuoteKanbanFilters } from './QuoteKanbanFilters';
import { QuoteKanbanManageColumnsDialog } from './QuoteKanbanManageColumnsDialog';
import { RejectQuoteDialog } from '../RejectQuoteDialog';
import { useQuoteKanbanColumns } from '../../hooks/useQuoteKanbanColumns';
import { useAuthStore } from '../../../../store/authStore';
import { PERMISSIONS } from '../../../../utils/constants';
import { quotesApi } from '../../../../api/quotes.api';
import type { Quote, QuoteStatus } from '../../../../types/quote.types';
import {
  ALLOWED_QUOTE_TRANSITIONS,
  QUOTE_STATUS_CONFIG,
  QuoteStatus as QStatus,
} from '../../../../types/quote.types';
import type { BoardFilters } from '../../../../types/quoteKanban.types';
import { ALL_LOCATIONS, useLocationStore } from '../../../../store/locationStore';
import { SedeDot } from '../../../../components/layout/LocationSelector';

interface QuoteKanbanBoardProps {
  initialFilters?: BoardFilters;
  onViewQuote: (id: string) => void;
  onEditQuote: (id: string) => void;
  onDeleteQuote: (quote: Quote) => void;
  onConvertQuote: (quote: Quote) => void;
}

export const QuoteKanbanBoard: React.FC<QuoteKanbanBoardProps> = ({
  initialFilters,
  onViewQuote,
  onEditQuote,
  onDeleteQuote,
  onConvertQuote,
}) => {
  const { user, hasPermission } = useAuthStore();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const { columns, columnsQuery } = useQuoteKanbanColumns();

  // Vista "Todas" del admin: las mismas columnas, con un carril por sede
  // (docs/PLAN_SEDES.md §6.2). Cada carril tiene su propio arrastre: una
  // cotización no cambia de sede.
  const isAllSedes = useLocationStore((s) => s.activeLocationId === ALL_LOCATIONS);
  const sedes = useLocationStore((s) => s.locations);

  const [filters, setFilters] = useState<BoardFilters>(initialFilters ?? {});
  const [activeQuote, setActiveQuote] = useState<Quote | null>(null);
  const [manageColumnsOpen, setManageColumnsOpen] = useState(false);
  const [rejectingQuote, setRejectingQuote] = useState<Quote | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);

  // Inject createdById filter for users without read_all_quotes permission
  const effectiveFilters: BoardFilters = hasPermission(PERMISSIONS.READ_ALL_QUOTES)
    ? filters
    : { ...filters, createdById: user?.id };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const quote = event.active.data.current?.quote as Quote;
    if (quote) setActiveQuote(quote);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveQuote(null);
    const { active, over } = event;
    if (!over) return;

    const quote = active.data.current?.quote as Quote;
    const targetStatus = over.data.current?.columnStatus as QuoteStatus;

    if (!quote || !targetStatus || quote.status === targetStatus) return;

    const allowed = ALLOWED_QUOTE_TRANSITIONS[quote.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      enqueueSnackbar(
        `No se puede mover de "${QUOTE_STATUS_CONFIG[quote.status].label}" a "${QUOTE_STATUS_CONFIG[targetStatus].label}"`,
        { variant: 'warning' },
      );
      return;
    }

    // El rechazo exige motivo: se captura antes de mover la tarjeta.
    if (targetStatus === QStatus.REJECTED) {
      setRejectingQuote(quote);
      return;
    }

    await applyStatusChange(quote, targetStatus);
  };

  const applyStatusChange = async (
    quote: Quote,
    targetStatus: QuoteStatus,
    rejectionReason?: string,
  ) => {
    try {
      await quotesApi.update(quote.id, {
        status: targetStatus,
        ...(rejectionReason ? { rejectionReason } : {}),
      });
      queryClient.invalidateQueries({ queryKey: ['quotes-board', quote.status] });
      queryClient.invalidateQueries({ queryKey: ['quotes-board', targetStatus] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    } catch (error: any) {
      enqueueSnackbar(
        error?.response?.data?.message || 'No se pudo cambiar el estado',
        { variant: 'error' },
      );
      throw error;
    }
  };

  const handleConfirmReject = async (rejectionReason: string) => {
    if (!rejectingQuote) return;
    setIsRejecting(true);
    try {
      await applyStatusChange(rejectingQuote, QStatus.REJECTED, rejectionReason);
    } finally {
      setIsRejecting(false);
    }
  };

  const handleDragCancel = () => {
    setActiveQuote(null);
  };

  const handleClearFilters = () => setFilters({});

  /** Las columnas del tablero, con su arrastre. `locationId`: carril de una sede en "Todas". */
  const renderLane = (locationId: string | undefined, height: number | string) => (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          pb: 2,
          height,
          minHeight: locationId ? undefined : 400,
          alignItems: 'flex-start',
        }}
      >
        {columns.map((column) => (
          <QuoteKanbanColumn
            key={column.id}
            column={column}
            baseFilters={effectiveFilters}
            locationId={locationId}
            onView={onViewQuote}
            onEdit={onEditQuote}
            onDelete={onDeleteQuote}
            onConvert={onConvertQuote}
          />
        ))}
      </Box>

      <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
        {activeQuote ? (
          <QuoteKanbanCard
            quote={activeQuote}
            onView={() => {}}
            onEdit={() => {}}
            onDelete={() => {}}
            onConvert={() => {}}
            overlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );

  if (columnsQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <Typography color="text.secondary">Cargando tablero...</Typography>
      </Box>
    );
  }

  if (columns.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <Typography color="text.secondary">No hay columnas configuradas para el tablero.</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <QuoteKanbanFilters
            filters={filters}
            onChange={setFilters}
            onClear={handleClearFilters}
          />
        </Box>
        {hasPermission(PERMISSIONS.MANAGE_QUOTE_COLUMNS) && (
          <Tooltip title="Administrar columnas">
            <IconButton onClick={() => setManageColumnsOpen(true)} size="small" sx={{ mt: 0.5 }}>
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {isAllSedes ? (
        sedes.map((sede) => (
          <Box key={sede.id} sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <SedeDot color={sede.color} size={12} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {sede.name}
              </Typography>
            </Box>
            {renderLane(sede.id, 420)}
          </Box>
        ))
      ) : (
        renderLane(undefined, 'calc(100vh - 320px)')
      )}

      <QuoteKanbanManageColumnsDialog
        open={manageColumnsOpen}
        onClose={() => setManageColumnsOpen(false)}
        columns={columns}
      />

      <RejectQuoteDialog
        open={!!rejectingQuote}
        quoteNumber={rejectingQuote?.quoteNumber}
        onClose={() => setRejectingQuote(null)}
        onConfirm={handleConfirmReject}
        isLoading={isRejecting}
      />
    </Box>
  );
};
