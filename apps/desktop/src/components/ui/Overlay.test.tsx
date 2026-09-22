// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Modal, OverlayHost, OverlayNotice, OverlayProvider } from './Overlay';
import { CommandPalette } from './CommandPalette';

afterEach(cleanup);

function Harness() {
  const [open, setOpen] = useState(false);
  return <OverlayProvider>
    <main data-testid="background"><button onClick={() => setOpen(true)}>Abrir diálogo</button></main>
    <OverlayHost />
    {open && <Modal ariaLabel="Diálogo de prueba" onClose={() => setOpen(false)} className="grid place-items-center">
      <section><button>Primero</button><button>Último</button></section>
    </Modal>}
  </OverlayProvider>;
}

function NestedHarness() {
  const [outerOpen, setOuterOpen] = useState(true);
  const [innerOpen, setInnerOpen] = useState(false);
  return <OverlayProvider>
    <main data-testid="background" />
    <OverlayHost />
    {outerOpen && <Modal ariaLabel="Primer diálogo" onClose={() => setOuterOpen(false)}><button onClick={() => setInnerOpen(true)}>Abrir segundo</button></Modal>}
    {innerOpen && <Modal ariaLabel="Segundo diálogo" onClose={() => setInnerOpen(false)}><button>Cerrar después</button></Modal>}
  </OverlayProvider>;
}

describe('Overlay', () => {
  it('renderiza el diálogo en el host, bloquea el fondo y restaura el foco', async () => {
    const user = userEvent.setup();
    const view = render(<Harness />);
    const trigger = view.getByRole('button', { name: 'Abrir diálogo' });
    await user.click(trigger);

    const dialog = await view.findByRole('dialog', { name: 'Diálogo de prueba' });
    const host = view.container.querySelector<HTMLElement>('[data-overlay-host]');
    const background = view.getByTestId('background');
    expect(host?.contains(dialog)).toBe(true);
    expect(host?.classList.contains('fixed')).toBe(true);
    expect(host?.classList.contains('layer-overlay')).toBe(true);
    expect(background.inert).toBe(true);
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Primero'));

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement?.textContent).toBe('Último');
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement?.textContent).toBe('Primero');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(background.inert).toBeFalsy();
  });

  it('mantiene los avisos en el host sin convertirlos en modales', () => {
    const view = render(<OverlayProvider><main data-testid="background" /><OverlayHost /><OverlayNotice role="status">Guardado</OverlayNotice></OverlayProvider>);
    const notice = view.getByRole('status');
    expect(view.container.querySelector('[data-overlay-host]')?.contains(notice)).toBe(true);
    expect(view.getByTestId('background').inert).toBeFalsy();
  });

  it('cierra únicamente el diálogo superior cuando hay overlays apilados', async () => {
    const user = userEvent.setup();
    const view = render(<NestedHarness />);
    await user.click(await view.findByRole('button', { name: 'Abrir segundo' }));
    expect(await view.findByRole('dialog', { name: 'Segundo diálogo' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(view.queryByRole('dialog', { name: 'Segundo diálogo' })).toBeNull());
    expect(view.getByRole('dialog', { name: 'Primer diálogo' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
  });

  it('mantiene la paleta global sobre el shell y bloquea su contenido', async () => {
    const view = render(<><div data-noite-shell data-testid="shell"><button>Anterior</button></div><MemoryRouter><CommandPalette /></MemoryRouter></>);
    const previous = view.getByRole('button', { name: 'Anterior' });
    previous.focus();
    fireEvent(window, new CustomEvent('app-command-palette'));

    const palette = await view.findByRole('dialog', { name: 'Comandos rápidos' });
    expect(palette.classList.contains('layer-command')).toBe(true);
    expect(view.getByTestId('shell').inert).toBe(true);
    await waitFor(() => expect(document.activeElement?.tagName).toBe('INPUT'));

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(view.queryByRole('dialog', { name: 'Comandos rápidos' })).toBeNull());
    expect(view.getByTestId('shell').inert).toBeFalsy();
    expect(document.activeElement).toBe(previous);
  });
});
