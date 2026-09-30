import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';
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
      <SnackbarProvider>
        <MemoryRouter>
          <LocationSelector />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );

describe('LocationSelector', () => {
  beforeEach(() => useLocationStore.getState().clear());

  it('sin sedes no se muestra', () => {
    const { container } = renderSelector();
    expect(container).toBeEmptyDOMElement();
  });

  it('con una sola sede no hay a dónde cambiar, pero puede pedir apoyo en otra', () => {
    useLocationStore.getState().setFromAuth({
      locations: [sede('l-125', '125', '#FF8A7A')],
      defaultLocationId: 'l-125',
      canViewAllLocations: false,
    });
    renderSelector();

    fireEvent.click(screen.getByRole('button', { name: /Sede activa: Local 125/ }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Local 125',
      'Pedir apoyo en otra sede',
      'Mis solicitudes de sede',
    ]);
  });

  // Solo Zoom: apoyo en otra sede (docs/PLAN_SEDES.md §16)
  it('de apoyo solo ve la sede del apoyo, hasta cuándo, y cambiarse es pedirlo', () => {
    useLocationStore.getState().setFromAuth({
      locations: [sede('l-125', '125', '#FF8A7A')],
      defaultLocationId: 'l-125',
      canViewAllLocations: false,
      activeLocationSupport: {
        id: 's-1',
        locationId: 'l-125',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        reason: 'x',
        authorizedBy: 'Oscar Herrera',
        overdue: false,
        homeLocationIds: ['l-104'],
      },
    });
    renderSelector();

    fireEvent.click(screen.getByRole('button', { name: /Sede activa: Local 125/ }));
    expect(screen.getByText('De apoyo en')).toBeInTheDocument();
    expect(screen.getByText(/^Hasta el 5 /)).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Pedir cambio de sede' })).toBeInTheDocument();
  });

  it('quien ve todas las sedes no pide apoyos', () => {
    useLocationStore.getState().setFromAuth({
      locations: [sede('l-119', '119', '#F5B94A')],
      defaultLocationId: null,
      canViewAllLocations: true,
    });
    renderSelector();

    fireEvent.click(screen.getByRole('button', { name: /Sede activa/ }));
    expect(screen.queryByText('Pedir apoyo en otra sede')).not.toBeInTheDocument();
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
