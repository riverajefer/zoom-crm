import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LocationSelector } from './LocationSelector';
import { ALL_LOCATIONS, useLocationStore } from '../../store/locationStore';
import type { Sede } from '../../types';

const sede = (id: string, code: string, color: string): Sede => ({
  id,
  code,
  name: `Local ${code}`,
  type: 'STORE',
  color,
  address: null,
  phone: null,
});

const renderSelector = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LocationSelector />
    </QueryClientProvider>,
  );

describe('LocationSelector', () => {
  beforeEach(() => useLocationStore.getState().clear());

  it('sin sedes no se muestra', () => {
    const { container } = renderSelector();
    expect(container).toBeEmptyDOMElement();
  });

  it('con una sola sede la muestra fija, sin menú', () => {
    useLocationStore.getState().setFromAuth({
      locations: [sede('l-125', '125', '#FF8A7A')],
      defaultLocationId: 'l-125',
      canViewAllLocations: false,
    });
    renderSelector();

    expect(screen.getByLabelText('Sede: Local 125')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('con varias sedes permite cambiar y "Todas" solo con view_all_locations', () => {
    useLocationStore.getState().setFromAuth({
      locations: [sede('l-119', '119', '#F5B94A'), sede('l-125', '125', '#FF8A7A')],
      defaultLocationId: 'l-125',
      canViewAllLocations: false,
    });
    renderSelector();

    fireEvent.click(screen.getByRole('button', { name: /Sede activa: Local 125/ }));
    expect(screen.queryByText('Todas las sedes')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /Local 119/ }));

    expect(useLocationStore.getState().activeLocationId).toBe('l-119');
  });

  it('quien ve todas las sedes puede elegir "Todas"', () => {
    useLocationStore.getState().setFromAuth({
      locations: [sede('l-119', '119', '#F5B94A'), sede('l-125', '125', '#FF8A7A')],
      defaultLocationId: null,
      canViewAllLocations: true,
    });
    renderSelector();

    fireEvent.click(screen.getByRole('button', { name: /Sede activa/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Todas las sedes/ }));

    expect(useLocationStore.getState().activeLocationId).toBe(ALL_LOCATIONS);
  });
});
