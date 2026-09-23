import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { useDraggable } from '@dnd-kit/core';
import { STEP_CATEGORIES, STEP_CATEGORY_STYLES } from '../../utils/builder.constants';
import { gradients, neonEffects } from '../../../../theme/colors';

interface DraggableStepBlockProps {
  stepDef: any;
  index: number;
}

const DraggableStepBlock: React.FC<DraggableStepBlockProps> = ({ stepDef, index }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `library-${stepDef.id}`,
    data: {
      type: 'library-step',
      step: stepDef,
    },
  });

  const styleConfig = STEP_CATEGORY_STYLES[stepDef.type] || STEP_CATEGORY_STYLES['_DEFAULT'];
  const Icon = styleConfig.icon;
  
  const bgColors = isDark ? styleConfig.darkBg : styleConfig.lightBg;
  const textColors = isDark ? styleConfig.darkText : styleConfig.lightText;
  const hoverBgColor = isDark ? styleConfig.darkBgColor : styleConfig.lightBgColor;

  return (
    <Box
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.5,
        mb: 1,
        borderRadius: 1.5,
        color: textColors,
        cursor: 'grab',
        opacity: isDragging ? 0.85 : 1,
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        // Dark mode: glass background + colored left accent border
        ...(isDark ? {
          bgcolor: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid',
          borderColor: isDragging ? textColors : 'rgba(255, 255, 255, 0.06)',
          borderLeft: `3px solid ${textColors}`,
          boxShadow: isDragging
            ? `0 0 18px ${textColors}80, -3px 0 10px ${textColors}40`
            : `-2px 0 8px ${textColors}15`,
          '@keyframes fadeInUp': {
            from: { opacity: 0, transform: 'translateY(8px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
          animation: `fadeInUp 0.35s ease-out ${index * 0.04}s both`,
        } : {
          bgcolor: bgColors,
          border: '1px solid',
          borderColor: isDragging ? textColors : 'transparent',
          boxShadow: isDragging ? `0 8px 16px ${textColors}40` : 'none',
        }),
        '&:hover': isDark ? {
          bgcolor: `${textColors}15`,
          borderColor: `${textColors}70`,
          borderLeft: `4px solid ${textColors}`,
          boxShadow: `0 0 24px ${textColors}70, -4px 0 16px ${textColors}50`,
          transform: 'translateX(5px) scale(1.04)',
          '& .step-icon-container': {
            transform: 'scale(1.25) rotate(15deg)',
            boxShadow: `0 0 20px ${textColors}70`,
            bgcolor: `${textColors}30`,
          },
        } : {
          bgcolor: hoverBgColor,
          borderColor: textColors,
          boxShadow: `0 6px 16px ${textColors}40`,
          transform: 'translateY(-3px) scale(1.02)',
        },
        '&:active': {
          cursor: 'grabbing',
          transform: 'scale(0.92)',
          transition: 'transform 0.1s cubic-bezier(0.4, 0, 0.2, 1)',
          ...(isDark && {
            boxShadow: `0 0 30px ${textColors}90, -4px 0 20px ${textColors}70`,
          }),
        },
      }}
    >
      {/* Icon with neon glow + hover animation */}
      <Box
        className="step-icon-container"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 30,
          height: 30,
          borderRadius: '8px',
          flexShrink: 0,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          ...(isDark ? {
            bgcolor: `${textColors}15`,
            boxShadow: `0 0 8px ${textColors}25`,
          } : {
            bgcolor: bgColors,
          }),
        }}
      >
        <Icon size={16} />
      </Box>
      <Typography variant="body2" fontWeight={500} sx={{ 
        transition: 'all 0.25s ease',
        ...(isDark && { 
          color: 'rgba(255, 255, 255, 0.85)',
        }),
      }}>
        {stepDef.name}
      </Typography>
    </Box>
  );
};

interface StepLibraryProps {
  stepDefinitions: any[];
}

export const StepLibrary: React.FC<StepLibraryProps> = ({ stepDefinitions }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        width: 260,
        flexShrink: 0,
        height: '100%',
        overflowY: 'auto',
        borderRight: 1,
        borderColor: isDark ? 'rgba(46, 167, 224, 0.15)' : 'divider',
        bgcolor: 'background.paper',
        p: 2,
        position: 'relative',
        // Glassmorphism + radial glow in dark mode
        ...(isDark && {
          background: neonEffects.glass.darkIntense.background,
          backdropFilter: neonEffects.glass.darkIntense.backdropFilter,
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '120px',
            background: 'radial-gradient(ellipse at 50% 0%, rgba(163, 211, 60, 0.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          },
        }),
        // Scrollbar styling for dark mode
        ...(isDark && {
          '&::-webkit-scrollbar': { width: 4 },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(163, 211, 60, 0.3)',
            borderRadius: 2,
          },
        }),
      }}
    >
      {/* Gradient title in dark mode */}
      <Typography
        variant="subtitle1"
        fontWeight={700}
        mb={3}
        sx={{
          position: 'relative',
          zIndex: 1,
          ...(isDark && {
            background: gradients.neonPrimary,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '0.02em',
          }),
        }}
      >
        Biblioteca de pasos
      </Typography>

      {STEP_CATEGORIES.map((category) => {
        const stepsInCategory = stepDefinitions.filter((s) => category.types.includes(s.type));

        if (stepsInCategory.length === 0) return null;

        return (
          <Box key={category.id} mb={3} sx={{ position: 'relative', zIndex: 1 }}>
            <Typography
              variant="caption"
              fontWeight={600}
              sx={{
                textTransform: 'uppercase',
                mb: 1,
                display: 'block',
                letterSpacing: '0.08em',
                color: isDark ? 'rgba(193, 227, 238, 0.7)' : 'text.secondary',
                ...(isDark && {
                  textShadow: '0 0 8px rgba(163, 211, 60, 0.3)',
                }),
              }}
            >
              {category.name}
            </Typography>
            {/* Animated neon underline for category headers in dark mode */}
            {isDark && (
              <Box
                sx={{
                  height: 1,
                  mb: 1.5,
                  borderRadius: 1,
                  background: gradients.neonHorizontal,
                  backgroundSize: '200% 100%',
                  opacity: 0.4,
                  '@keyframes gradientShift': {
                    '0%': { backgroundPosition: '0% 50%' },
                    '50%': { backgroundPosition: '100% 50%' },
                    '100%': { backgroundPosition: '0% 50%' },
                  },
                  animation: 'gradientShift 4s ease infinite',
                }}
              />
            )}
            {stepsInCategory.map((step, idx) => (
              <DraggableStepBlock key={step.id} stepDef={step} index={idx} />
            ))}
          </Box>
        );
      })}

      {/* Dynamic section for custom / user-created steps not in any known category */}
      {(() => {
        const knownTypes = new Set(STEP_CATEGORIES.flatMap((c) => c.types));
        const customSteps = stepDefinitions.filter((s) => !knownTypes.has(s.type));
        if (customSteps.length === 0) return null;
        return (
          <Box mb={3} sx={{ position: 'relative', zIndex: 1 }}>
            <Typography
              variant="caption"
              fontWeight={600}
              sx={{
                textTransform: 'uppercase',
                mb: 1,
                display: 'block',
                letterSpacing: '0.08em',
                color: isDark ? 'rgba(193, 227, 238, 0.7)' : 'text.secondary',
                ...(isDark && {
                  textShadow: '0 0 8px rgba(163, 211, 60, 0.3)',
                }),
              }}
            >
              Personalizados
            </Typography>
            {isDark && (
              <Box
                sx={{
                  height: 1,
                  mb: 1.5,
                  borderRadius: 1,
                  background: gradients.neonHorizontal,
                  backgroundSize: '200% 100%',
                  opacity: 0.4,
                  '@keyframes gradientShift': {
                    '0%': { backgroundPosition: '0% 50%' },
                    '50%': { backgroundPosition: '100% 50%' },
                    '100%': { backgroundPosition: '0% 50%' },
                  },
                  animation: 'gradientShift 4s ease infinite',
                }}
              />
            )}
            {customSteps.map((step, idx) => (
              <DraggableStepBlock key={step.id} stepDef={step} index={idx} />
            ))}
          </Box>
        );
      })()}
    </Box>
  );
};
