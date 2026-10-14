import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../types';
import { useAuthStore } from '../store/authStore';
import { queryClient } from './queryClient';

// Aísla el store de axios/import.meta/notistack.
vi.mock('../api/auth.api', () => ({ authApi: {} }));

const user = (id: string) => ({ id, username: id }) as unknown as User;
const SESSIONS = ['cash', 'sessions', 'OPEN'];

describe('queryClient', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: user('caja.119'), isAuthenticated: true });
    queryClient.setQueryData(SESSIONS, ['sesión del 119']);
  });

  it('borra la caché al cerrar sesión', () => {
    useAuthStore.setState({ user: null, isAuthenticated: false });

    expect(queryClient.getQueryData(SESSIONS)).toBeUndefined();
  });

  it('borra la caché cuando entra otro usuario, aunque no haya pasado por el logout', () => {
    useAuthStore.setState({ user: user('caja.104') });

    expect(queryClient.getQueryData(SESSIONS)).toBeUndefined();
  });

  it('la conserva si el usuario es el mismo (por ejemplo, al actualizar su perfil)', () => {
    useAuthStore.setState({ user: { ...user('caja.119'), firstName: 'Otro' } as User });

    expect(queryClient.getQueryData(SESSIONS)).toEqual(['sesión del 119']);
  });
});
