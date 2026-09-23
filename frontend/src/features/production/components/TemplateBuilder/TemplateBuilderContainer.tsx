import React, { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Box, useTheme } from '@mui/material';
import { useTemplateBuilderStore } from '../../store/useTemplateBuilderStore';
import { StepLibrary } from './StepLibrary';
import { TemplateCanvas } from './TemplateCanvas';
import { STEP_CATEGORY_STYLES } from '../../utils/builder.constants';
import { gradients } from '../../../../theme/colors';

interface TemplateBuilderContainerProps {
  stepDefinitions: any[];
}

export const TemplateBuilderContainer: React.FC<TemplateBuilderContainerProps> = ({ stepDefinitions }) => {
  const store = useTemplateBuilderStore();
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const [activeDragData, setActiveDragData] = useState<any>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const { data } = active;
    
    if (data.current) {
      setActiveDragData(data.current);
      store.setActiveId(active.id as string, data.current.type);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;

    if (activeType === 'step') {
      const activeComponentId = active.data.current?.componentId;
      const overComponentId = overType === 'component' 
        ? over.id 
        : overType === 'component-dropzone'
          ? over.data.current?.componentId
          : over.data.current?.componentId;

      if (!activeComponentId || !overComponentId) return;

      if (activeComponentId !== overComponentId) {
        store.moveStep(
          activeComponentId,
          overComponentId,
          active.id as string,
          overType === 'step' ? over.id as string : undefined
        );
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    store.setActiveId(null, null);
    setActiveDragData(null);

    if (!over) return;

    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;

    // 1. Reorder components
    if (activeType === 'component' && overType === 'component' && active.id !== over.id) {
      store.reorderComponents(active.id as string, over.id as string);
      return;
    }

    // 2. Reorder steps within same component
    if (activeType === 'step') {
      const activeComponentId = active.data.current?.componentId;
      const overComponentId = overType === 'step' ? over.data.current?.componentId : over.data.current?.componentId || over.id;

      if (activeComponentId && overComponentId && activeComponentId === overComponentId && active.id !== over.id) {
        store.reorderSteps(activeComponentId, active.id as string, over.id as string);
      }
      return;
    }

    // 3. Drop from library to component
    if (activeType === 'library-step') {
      const stepDef = active.data.current?.step;
      const targetComponentId = overType === 'component-dropzone' || overType === 'step' 
        ? over.data.current?.componentId || over.id
        : over.id;

      // Ensure it's dropping over a valid component
      const targetComponent = store.components.find(c => c.id === targetComponentId);
      
      if (targetComponent && stepDef) {
        store.addStep(targetComponent.id, stepDef.id, stepDef.type, stepDef.name);
      }
    }
  };

  const dropAnimation = {
    duration: 300,
    easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    sideEffects: defaultDropAnimationSideEffects({
      styles: { active: { opacity: '0.4' } },
    }),
  };

  const renderDragOverlay = () => {
    if (!activeDragData) return null;

    if (activeDragData.type === 'library-step' || activeDragData.type === 'step') {
      const stepData = activeDragData.type === 'library-step' ? activeDragData.step : activeDragData.step;
      const styleConfig = STEP_CATEGORY_STYLES[stepData.type || stepData.stepType] || STEP_CATEGORY_STYLES['PAPEL'];
      const Icon = styleConfig.icon;
      
      const theme = document.documentElement.className.includes('dark');
      const bgColors = theme ? styleConfig.darkBg : styleConfig.lightBg;
      const textColors = theme ? styleConfig.darkText : styleConfig.lightText;
      
      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: 1.5,
            borderRadius: 2,
            bgcolor: theme ? 'rgba(22, 24, 22, 0.95)' : bgColors,
            color: textColors,
            border: `1.5px solid ${textColors}`,
            borderLeft: `3px solid ${textColors}`,
            width: 250,
            // Floating animation while dragging
            '@keyframes overlayFloat': {
              '0%, 100%': { transform: 'scale(1.1) translateY(0px) rotate(0deg)' },
              '50%': { transform: 'scale(1.12) translateY(-6px) rotate(2deg)' },
            },
            '@keyframes overlayGlow': {
              '0%, 100%': {
                boxShadow: theme
                  ? `0 0 25px ${textColors}80, 0 0 10px ${textColors}50, 0 12px 25px rgba(0,0,0,0.6)`
                  : `0 12px 30px ${textColors}50`,
              },
              '50%': {
                boxShadow: theme
                  ? `0 0 40px ${textColors}A0, 0 0 15px ${textColors}70, 0 18px 35px rgba(0,0,0,0.8)`
                  : `0 18px 40px ${textColors}60`,
              },
            },
            animation: 'overlayFloat 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite, overlayGlow 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite',
          }}
        >
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            ...(theme && { filter: `drop-shadow(0 0 5px ${textColors}90)` }),
          }}>
            <Icon size={18} />
          </Box>
          <Box sx={{ fontWeight: 500 }}>{stepData.name}</Box>
        </Box>
      );
    }
    
    if (activeDragData.type === 'component') {
      return (
        <Box
          sx={(theme) => {
            const isDark = theme.palette.mode === 'dark';
            const pc = theme.palette.primary.main;
            return {
              height: 60,
              bgcolor: 'background.paper',
              border: '2px solid',
              borderColor: 'primary.main',
              borderRadius: 2.5,
              opacity: 0.9,
              ...(isDark && {
                background: gradients.darkCard,
              }),
              '@keyframes componentFloat': {
                '0%, 100%': {
                  transform: 'scale(1.05) translateY(0px) rotate(-1deg)',
                  boxShadow: isDark
                    ? `0 0 30px ${pc}70, 0 0 10px ${pc}50`
                    : `0 12px 30px ${pc}50`,
                },
                '50%': {
                  transform: 'scale(1.07) translateY(-6px) rotate(1deg)',
                  boxShadow: isDark
                    ? `0 0 45px ${pc}A0, 0 0 16px ${pc}70`
                    : `0 20px 40px ${pc}60`,
                },
              },
              animation: 'componentFloat 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite',
            };
          }}
        />
      );
    }

    return null;
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <Box
        sx={{
          display: 'flex',
          height: 'calc(100vh - 200px)',
          border: '1px solid',
          borderColor: isDarkMode ? 'rgba(46, 167, 224, 0.2)' : 'divider',
          borderRadius: 2.5,
          overflow: 'hidden',
          position: 'relative',
          // Mesh gradient background + subtle neon border glow in dark mode
          ...(isDarkMode && {
            background: gradients.darkMesh,
            boxShadow: '0 0 1px rgba(46, 167, 224, 0.3), 0 4px 24px rgba(0, 0, 0, 0.4)',
          }),
        }}
      >
        <StepLibrary stepDefinitions={stepDefinitions} />
        <TemplateCanvas />
      </Box>

      <DragOverlay dropAnimation={dropAnimation}>
        {renderDragOverlay()}
      </DragOverlay>
    </DndContext>
  );
};
