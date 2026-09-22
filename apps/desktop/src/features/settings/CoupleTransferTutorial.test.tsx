// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { ModalPortal, OverlayHost, OverlayProvider } from '../../components/ui/Overlay';
import { CoupleTransferTutorial } from './CoupleTransferTutorial';

afterEach(cleanup);

function Harness() {
  const [open, setOpen] = useState(false);
  return <OverlayProvider>
    <button onClick={() => setOpen(true)}>Ayuda para parejas</button>
    <OverlayHost />
    <ModalPortal onClose={() => setOpen(false)}>{open && <CoupleTransferTutorial onClose={() => setOpen(false)} />}</ModalPortal>
  </OverlayProvider>;
}

it('explica ambos roles, privacidad y reemplazo', async () => {
  const user = userEvent.setup();
  const view = render(<Harness />);
  await user.click(view.getByRole('button', { name: 'Ayuda para parejas' }));
  const dialog = await view.findByRole('dialog', { name: 'Cómo compartir sus datos' });
  expect(dialog.querySelectorAll('li')).toHaveLength(6);
  expect(dialog.textContent).toContain('bóveda y credenciales');
  expect(dialog.textContent).toContain('Importar reemplaza datos; no combina dos bibliotecas');
  expect(dialog.textContent).toContain('Quien envía');
  expect(dialog.textContent).toContain('Quien recibe');
  expect(dialog.textContent).toContain('exporten un archivo .noche');
  await user.click(view.getByRole('button', { name: 'Entendido' }));
  expect(view.queryByRole('dialog')).toBeNull();
});

it('cierra con Escape y devuelve el foco al botón de ayuda', async () => {
  const user = userEvent.setup();
  const view = render(<Harness />);
  const trigger = view.getByRole('button', { name: 'Ayuda para parejas' });
  await user.click(trigger);
  await view.findByRole('dialog');
  await user.keyboard('{Escape}');
  await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});
