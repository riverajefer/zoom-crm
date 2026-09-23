import React from 'react';
import { Box, Typography, IconButton, useTheme } from '@mui/material';
import { useSortable, defaultAnimateLayoutChanges } from '@dnd-kit/sortable';
import type { AnimateLayoutChanges } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { BuilderStep } from '../../types/builder.types';
import { STEP_CATEGORY_STYLES } from '../../utils/builder.constants';

const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true });

interface StepPillProps {
  step: BuilderStep;
  componentId: string;
  onRemove: (componentId: string, stepId: string) => void;
}

export const StepPill: React.FC<StepPillProps> = ({ step, componentId, onRemove }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isSorting,
  } = useSortable({
    id: step.id,
    animateLayoutChanges,
    data: {
      type: 'step',
      step,
      componentId,
    },
    transition: {
      duration: 300,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  };

  const styleConfig = STEP_CATEGORY_STYLES[step.stepType] || STEP_CATEGORY_STYLES['PAPEL'];
  const Icon = styleConfig.icon;
  
  const bgColors = isDark ? styleConfig.darkBg : styleConfig.lightBg;
  const textColors = isDark ? styleConfig.darkText : styleConfig.lightText;

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1,
        mb: 1,
        borderRadius: 1.5,
        bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'background.paper',
        border: '1px solid',
        borderColor: isDragging
          ? textColors
          : (isDark ? `${textColors}20` : 'divider'),
        opacity: isDragging ? 0.5 : 1,
        transition: isSorting
          ? 'none'
          : 'all 0.25s cubic-bezier(0.25, 1, 0.5, 1)',
        boxShadow: isDragging 
          ? (isDark ? `0 0 20px ${textColors}90, 0 0 8px ${textColors}50` : `0 8px 16px ${textColors}40`)
          : 'none',
        // Placeholder ghost styling when being dragged
        ...(isDragging && isDark && {
          bgcolor: `${textColors}06`,
          borderStyle: 'dashed',
        }),
        // Entry animation for dark mode
        ...(isDark && !isDragging && !isSorting && {
          '@keyframes pillSlideIn': {
            from: { opacity: 0, transform: 'translateX(-10px)' },
            to: { opacity: 1, transform: 'translateX(0)' },
          },
          animation: 'pillSlideIn 0.3s ease-out both',
        }),
        '&:hover': {
          borderColor: textColors,
          boxShadow: isDark 
            ? `0 0 20px ${textColors}80, 0 4px 12px ${textColors}50` 
            : `0 6px 16px ${textColors}40`,
          transform: isDark ? 'translateY(-3px) scale(1.02)' : 'translateY(-2px) scale(1.01)',
          // Animate drag handle on pill hover
          '& .pill-drag-handle': {
            color: isDark ? textColors : 'text.primary',
            ...(isDark && {
              transform: 'scale(1.3)',
              filter: `drop-shadow(0 0 6px ${textColors}80)`,
            }),
          },
          // Glow badge on hover
          '& .pill-order-badge': isDark ? {
            boxShadow: `0 0 16px ${textColors}80, 0 0 6px ${textColors}60`,
            transform: 'scale(1.15) rotate(-5deg)',
          } : {},
        },
      }}
    >
      <Box
        className="pill-drag-handle"
        {...attributes}
        {...listeners}
        sx={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'grab',
          color: 'text.secondary',
          transition: 'all 0.25s cubic-bezier(0.25, 1, 0.5, 1)',
          '&:active': { cursor: 'grabbing', transform: 'scale(0.8)' },
        }}
      >
        <DragIndicatorIcon fontSize="small" />
      </Box>

      <Box
        className="pill-order-badge"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          borderRadius: '50%',
          bgcolor: bgColors,
          color: textColors,
          transition: 'all 0.25s cubic-bezier(0.25, 1, 0.5, 1)',
          // Neon glow on badge in dark mode
          ...(isDark && {
            boxShadow: `0 0 6px ${textColors}50, 0 0 2px ${textColors}30`,
          }),
        }}
      >
        <Typography variant="caption" fontWeight="bold">
          {step.order}
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          ...(isDark && {
            filter: `drop-shadow(0 0 2px ${textColors}60)`,
          }),
        }}
      >
        <Icon size={16} color={textColors} />
      </Box>

      <Typography variant="body2" sx={{ flexGrow: 1, fontWeight: 500 }}>
        {step.name}
      </Typography>

      <IconButton
        size="small"
        color="error"
        onClick={() => onRemove(componentId, step.id)}
        sx={{
          opacity: 0.4,
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            opacity: 1,
            transform: 'scale(1.2) rotate(90deg)',
            ...(isDark && { filter: 'drop-shadow(0 0 8px rgba(232, 70, 90, 0.8))' }),
          },
        }}
      >
        <DeleteIcon fontSize="small" />
      </IconButton>
    </Box>
  );
};
