import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DirectActionReasonDialog } from './DirectActionReasonDialog';

const renderDialog = (onConfirm = vi.fn().mockResolvedValue(undefined), onClose = vi.fn()) => {
  render(
    <DirectActionReasonDialog
      open
      title="Anular la orden 125-OP-0001"
      confirmLabel="Anular orden"
      onClose={onClose}
      onConfirm={onConfirm}
    />,
  );
  return { onConfirm, onClose };
};

describe('DirectActionReasonDialog', () => {
  it('no confirma sin motivo', async () => {
    const { onConfirm } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Anular orden' }));

    expect(await screen.findByText('El motivo es obligatorio')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirma con el motivo sin espacios sobrantes y se cierra', async () => {
    const { onConfirm, onClose } = renderDialog();

    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: '  El cliente canceló  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anular orden' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('El cliente canceló'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
