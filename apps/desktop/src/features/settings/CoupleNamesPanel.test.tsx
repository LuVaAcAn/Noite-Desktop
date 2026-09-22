// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_LOCAL_SETTINGS } from '@proyecto-noche/domain';
import { CoupleNamesPanel } from './CoupleNamesPanel';

afterEach(cleanup);

it('requiere confirmar ambos nombres y vuelve a pedir confirmación al cambiarlos', async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockResolvedValue(undefined);
  const view = render(<CoupleNamesPanel settings={{ ...DEFAULT_LOCAL_SETTINGS, userName: 'Ana' }} onSave={save} />);
  const button = view.getByRole('button', { name: 'Guardar nombres de pareja' }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  await user.type(view.getByLabelText('Segunda persona'), 'Luz');
  await user.click(view.getByRole('checkbox'));
  expect(button.disabled).toBe(false);
  await user.type(view.getByLabelText('Primera persona'), ' María');
  expect(button.disabled).toBe(true);
  await user.click(view.getByRole('checkbox'));
  await user.click(button);
  expect(save).toHaveBeenCalledExactlyOnceWith({ userName: 'Ana María', partnerName: 'Luz' });
});

it('rechaza nombres vacíos o indistinguibles y conserva el formulario si falla el guardado', async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockRejectedValue(new Error('disk full'));
  const view = render(<CoupleNamesPanel settings={{ ...DEFAULT_LOCAL_SETTINGS, userName: 'Ana', partnerName: ' ana ' }} onSave={save} />);
  expect((view.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
  await user.clear(view.getByLabelText('Segunda persona'));
  await user.type(view.getByLabelText('Segunda persona'), 'Luz');
  await user.click(view.getByRole('checkbox'));
  await user.click(view.getByRole('button', { name: 'Guardar nombres de pareja' }));
  expect((await view.findByRole('status')).textContent).toContain('No se pudieron guardar');
  expect((view.getByLabelText('Segunda persona') as HTMLInputElement).value).toBe('Luz');
});
