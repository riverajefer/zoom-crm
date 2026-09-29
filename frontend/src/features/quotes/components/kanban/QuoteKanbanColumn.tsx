import React, { useEffect, useRef } from 'react';
import { Box, Chip, CircularProgress, Paper, Typography } from '@mui/material';
import { useDroppable } from '@dnd-kit/core';
import { QuoteKanbanCard } from './QuoteKanbanCard';
import { QuoteKanbanCardSkeleton } from './QuoteKanbanCardSkeleton';
import { useQuotesBoardColumn } from '../../hooks/useQuotesBoardColumn';
import type { QuoteKanbanColumn as QuoteKanbanColumnType } from '../../../../types/quoteKanban.types';
import type { BoardFilters } from '../../../../types/quoteKanban.types';
import type { Quote } from '../../../../types/quote.types';

interface QuoteKanbanColumnProps {
  column: QuoteKanbanColumnType;
  baseFilters: BoardFilters;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (quote: Quote) => void;
  onConvert: (quote: Quote) => void;
  /** Sede del carril en la vista "Todas"; sin ella, la sede activa. */
  locationId?: string;
}

export const QuoteKanbanColumn: React.FC<QuoteKanbanColumnProps> = ({
  column,
  baseFilters,
  onView,
  onEdit,
  onDelete,
  onConvert,
  locationId,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { columnStatus: column.mappedStatus },
  });

  const {
    quotes,
    total,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useQuotesBoardColumn(column.mappedStatus, baseFilters, locationId);

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const showInitialSkeletons = isFetching && quotes.length === 0;

  return (
    <Paper
      elevation={0}
      sx={{
        minWidth: 300,
        maxWidth: 340,
        width: 300,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: isOver ? 'action.hover' : 'grey.50',
        border: '1px solid',
        borderColor: isOver ? column.color : 'divider',
        borderRadius: 2,
        transition: 'border-color 0.2s, background-color 0.2s',
        overflow: 'hidden',
      }}
    >
      {/* Column header */}
      <Box
        sx={{
          px: 2,
          py: 1.25,
          borderBottom: '3px solid',
          borderBottomColor: column.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          bgcolor: 'background.paper',
          flexShrink: 0,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {column.name}
        </Typography>
        <Chip
          label={total}
          size="small"
          sx={{
            height: 20,
            fontSize: 11,
            fontWeight: 600,
            bgcolor: column.color,
            color: 'white',
          }}
        />
      </Box>

      {/* Scrollable body */}
      <Box
        ref={setNodeRef}
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 1,
          minHeight: 0,
        }}
      >
        {showInitialSkeletons ? (
          <>
            <QuoteKanbanCardSkeleton />
            <QuoteKanbanCardSkeleton />
            <QuoteKanbanCardSkeleton />
          </>
        ) : quotes.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 120,
              color: 'text.disabled',
            }}
          >
            <Typography variant="caption">Sin cotizaciones</Typography>
          </Box>
        ) : (
          quotes.map((quote) => (
            <QuoteKanbanCard
              key={quote.id}
              quote={quote}
              onView={onView}
              onEdit={onEdit}
              onDelete={onDelete}
              onConvert={onConvert}
            />
          ))
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} style={{ height: 4 }} />

        {/* Loading indicator for next page */}
        {isFetchingNextPage && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
            <CircularProgress size={20} />
          </Box>
        )}
      </Box>
    </Paper>
  );
};
