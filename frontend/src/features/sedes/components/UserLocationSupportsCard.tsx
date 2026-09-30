import React from 'react';
import { Card, CardContent, Typography } from '@mui/material';
import { useLocationSupportsList } from '../hooks/useLocationSupports';
import { LocationSupportsTable } from './LocationSupportsTable';

/** Historial de apoyos en otra sede de un usuario, en su ficha (Gerencia, docs/PLAN_SEDES.md §16). */
export const UserLocationSupportsCard: React.FC<{ userId: string }> = ({ userId }) => {
  const { data = [], isLoading } = useLocationSupportsList('all', { userId });

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mt: 3 }}>
      <CardContent sx={{ p: { xs: 2, md: 4 } }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Apoyos en otra sede
        </Typography>
        {!isLoading && (
          <LocationSupportsTable rows={data} showEmployee={false} emptyText="Nunca ha ido de apoyo a otra sede." />
        )}
      </CardContent>
    </Card>
  );
};
