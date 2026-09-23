import React, { useMemo } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Box, Button, useTheme } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useTemplateBuilderStore } from '../../store/useTemplateBuilderStore';
import { ComponentCard } from './ComponentCard';

export const TemplateCanvas: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const {
    components,
    addComponent,
    updateComponent,
    removeComponent,
    removeStep,
  } = useTemplateBuilderStore();

  const componentIds = useMemo(() => components.map((c) => c.id), [components]);
  const primaryColor = theme.palette.primary.main;

  return (
    <Box
      sx={{
        flexGrow: 1,
        p: 3,
        overflowY: 'auto',
        // Custom scrollbar for dark mode
        ...(isDark && {
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(46, 167, 224, 0.25)',
            borderRadius: 3,
            '&:hover': { background: 'rgba(46, 167, 224, 0.4)' },
          },
        }),
      }}
    >
      <SortableContext items={componentIds} strategy={verticalListSortingStrategy}>
        {components.map((component) => (
          <ComponentCard
            key={component.id}
            component={component}
            onUpdate={updateComponent}
            onRemove={removeComponent}
            onRemoveStep={removeStep}
          />
        ))}
      </SortableContext>
      
      <Button
        fullWidth
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={addComponent}
        sx={{
          py: 3,
          mt: components.length > 0 ? 0 : 4,
          borderStyle: 'dashed',
          borderWidth: 2,
          borderColor: isDark ? 'rgba(46, 167, 224, 0.25)' : 'divider',
          color: 'text.secondary',
          textTransform: 'none',
          fontSize: '1rem',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          borderRadius: 2.5,
          height: components.length === 0 ? 200 : 'auto',
          position: 'relative',
          overflow: 'hidden',
          // Animated gradient border effect on hover in dark mode
          ...(isDark && {
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              opacity: 0,
              transition: 'opacity 0.3s ease',
              background: `radial-gradient(circle at center, ${primaryColor}08 0%, transparent 70%)`,
            },
          }),
          '&:hover': {
            borderStyle: 'dashed',
            borderWidth: 2,
            borderColor: isDark ? `${primaryColor}80` : 'primary.main',
            bgcolor: isDark ? 'rgba(163, 211, 60, 0.04)' : 'action.hover',
            color: 'primary.main',
            ...(isDark && {
              boxShadow: `0 0 20px ${primaryColor}25, inset 0 0 20px ${primaryColor}08`,
              transform: 'translateY(-1px)',
              '&::before': { opacity: 1 },
            }),
          },
        }}
      >
        {components.length === 0 ? 'Agrega tu primer componente para empezar' : 'Añadir Nuevo Componente'}
      </Button>
    </Box>
  );
};
