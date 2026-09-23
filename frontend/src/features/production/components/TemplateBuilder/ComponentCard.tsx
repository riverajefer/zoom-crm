import React, { useMemo } from 'react';
import { Box, Typography, IconButton, TextField, MenuItem, Switch, FormControlLabel } from '@mui/material';
import { useSortable, defaultAnimateLayoutChanges } from '@dnd-kit/sortable';
import type { AnimateLayoutChanges } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { useDroppable } from '@dnd-kit/core';
import { BuilderComponent } from '../../types/builder.types';
import { StepPill } from './StepPill';
import { gradients } from '../../../../theme/colors';

const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true });

interface ComponentCardProps {
  component: BuilderComponent;
  onUpdate: (id: string, updates: Partial<BuilderComponent>) => void;
  onRemove: (id: string) => void;
  onRemoveStep: (componentId: string, stepId: string) => void;
}

export const ComponentCard: React.FC<ComponentCardProps> = ({
  component,
  onUpdate,
  onRemove,
  onRemoveStep,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isSorting,
  } = useSortable({
    id: component.id,
    animateLayoutChanges,
    data: {
      type: 'component',
      component,
    },
    transition: {
      duration: 350,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    },
  });

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: component.id,
    data: {
      type: 'component-dropzone',
      componentId: component.id,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  };

  const stepIds = useMemo(() => component.steps.map((s) => s.id), [component.steps]);

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={(theme) => {
        const isDark = theme.palette.mode === 'dark';
        const primaryColor = theme.palette.primary.main;
        return {
          mb: 3,
          borderRadius: 2.5,
          border: '1px solid',
          borderColor: isDragging
            ? primaryColor
            : (isDark ? 'rgba(46, 167, 224, 0.2)' : 'divider'),
          bgcolor: 'background.paper',
          opacity: isDragging ? 0.4 : 1,
          overflow: 'hidden',
          transition: isSorting
            ? 'none'
            : 'all 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
          // Dark mode: glassmorphism card background + neon glow
          ...(isDark && {
            background: gradients.darkCard,
            '@keyframes cardFadeIn': {
              from: { opacity: 0, transform: 'translateY(12px)' },
              to: { opacity: 1, transform: 'translateY(0)' },
            },
            animation: !isDragging && !isSorting ? 'cardFadeIn 0.4s ease-out both' : 'none',
          }),
          // Dashed ghost placeholder when dragging
          ...(isDragging && isDark && {
            borderStyle: 'dashed',
            background: `${primaryColor}08`,
          }),
          boxShadow: isDragging 
            ? (isDark ? `0 0 40px ${primaryColor}80, 0 0 15px ${primaryColor}50, 0 12px 30px rgba(0,0,0,0.7)` : `0 16px 32px ${primaryColor}40`)
            : (isDark ? `0 4px 24px rgba(0,0,0,0.5), 0 0 1px ${primaryColor}20` : 1),
          '&:hover': {
            borderColor: isDark ? `${primaryColor}80` : primaryColor,
            boxShadow: isDark 
              ? `0 0 25px ${primaryColor}60, 0 8px 24px rgba(0,0,0,0.6)` 
              : `0 8px 24px ${primaryColor}30`,
            transform: 'translateY(-4px) scale(1.01)',
            // Animate drag handle on card hover
            '& .card-drag-handle': isDark ? {
              color: primaryColor,
              transform: 'scale(1.25) rotate(5deg)',
              filter: `drop-shadow(0 0 6px ${primaryColor}80)`,
            } : {},
          }
        };
      }}
    >
      {/* Header */}
      <Box
        sx={(theme) => {
          const isDark = theme.palette.mode === 'dark';
          return {
            p: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            bgcolor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'grey.50',
            borderBottom: '1px solid',
            borderColor: isDark ? 'rgba(46, 167, 224, 0.15)' : 'divider',
            position: 'relative',
            // Subtle gradient accent line under header in dark mode
            ...(isDark && {
              '&::after': {
                content: '""',
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '1px',
                background: 'linear-gradient(90deg, transparent 0%, rgba(163, 211, 60, 0.4) 30%, rgba(46, 167, 224, 0.4) 70%, transparent 100%)',
              },
            }),
          };
        }}
      >
        <Box
          className="card-drag-handle"
          {...attributes}
          {...listeners}
          sx={{
            cursor: 'grab',
            color: 'text.secondary',
            display: 'flex',
            alignItems: 'center',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:active': { cursor: 'grabbing', transform: 'scale(0.8)' },
          }}
        >
          <DragIndicatorIcon />
        </Box>

        <TextField
          size="small"
          value={component.name}
          onChange={(e) => onUpdate(component.id, { name: e.target.value })}
          placeholder="Nombre del componente"
          sx={{ 
            minWidth: 200, 
            '& .MuiOutlinedInput-root': {
              bgcolor: 'background.paper'
            }
          }}
        />

        <TextField
          select
          size="small"
          value={component.phase}
          onChange={(e) => onUpdate(component.id, { phase: e.target.value as any })}
          sx={{ 
            minWidth: 150, 
            '& .MuiOutlinedInput-root': {
              bgcolor: 'background.paper'
            }
          }}
        >
          <MenuItem value="impresion">Impresión</MenuItem>
          <MenuItem value="material">Material</MenuItem>
          <MenuItem value="armado">Armado</MenuItem>
          <MenuItem value="despacho">Despacho</MenuItem>
        </TextField>

        <Box sx={{ flexGrow: 1 }} />

        <FormControlLabel
          control={
            <Switch
              checked={component.isRequired}
              onChange={(e) => onUpdate(component.id, { isRequired: e.target.checked })}
              color="primary"
            />
          }
          label={<Typography variant="body2">Requerido</Typography>}
        />

        <IconButton color="error" onClick={() => onRemove(component.id)}>
          <DeleteIcon />
        </IconButton>
      </Box>

      {/* Body - Dropzone */}
      <Box
        ref={setDroppableRef}
        sx={(theme) => {
          const isDark = theme.palette.mode === 'dark';
          return {
            p: 2,
            minHeight: 100,
            bgcolor: isOver
              ? (isDark ? `rgba(163, 211, 60, 0.06)` : 'action.hover')
              : 'transparent',
            transition: 'all 0.3s ease',
            ...(isOver && isDark && {
              boxShadow: `inset 0 0 20px rgba(163, 211, 60, 0.08)`,
            }),
          };
        }}
      >
        <SortableContext items={stepIds} strategy={verticalListSortingStrategy}>
          {component.steps.map((step) => (
            <StepPill
              key={step.id}
              step={step}
              componentId={component.id}
              onRemove={onRemoveStep}
            />
          ))}
        </SortableContext>

        <Box
          sx={(theme) => {
            const isDark = theme.palette.mode === 'dark';
            const primaryColor = theme.palette.primary.main;
            return {
              mt: component.steps.length > 0 ? 2 : 0,
              p: 2,
              border: '2px dashed',
              borderColor: isOver ? primaryColor : (isDark ? 'rgba(46, 167, 224, 0.2)' : 'divider'),
              borderRadius: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isOver ? (isDark ? primaryColor : 'primary.main') : 'text.secondary',
              bgcolor: isOver
                ? (isDark ? 'rgba(163, 211, 60, 0.12)' : 'primary.50')
                : 'transparent',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              // Neon pulse on active drop target (dark mode)
              ...(isOver && isDark && {
                '@keyframes dropzonePulse': {
                  '0%, 100%': { boxShadow: `0 0 12px ${primaryColor}40, inset 0 0 12px ${primaryColor}20` },
                  '50%': { boxShadow: `0 0 24px ${primaryColor}70, inset 0 0 20px ${primaryColor}30` },
                },
                animation: 'dropzonePulse 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite',
              }),
            };
          }}
        >
          <Typography
            variant="body2"
            sx={(theme) => ({
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: isOver ? 'scale(1.05)' : 'scale(1)',
              ...(isOver && theme.palette.mode === 'dark' && {
                textShadow: `0 0 12px ${theme.palette.primary.main}80`,
              }),
            })}
          >
            Arrastra pasos aquí
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};
