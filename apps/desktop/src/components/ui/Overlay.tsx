import {
  Children,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface OverlayContextValue {
  host: HTMLElement | null;
  modalStack: string[];
  setHost(host: HTMLElement | null): void;
  registerModal(id: string): () => void;
}

const OverlayContext = createContext<OverlayContextValue | null>(null);

function useOverlayContext() {
  const context = useContext(OverlayContext);
  if (!context) throw new Error('Los overlays deben renderizarse dentro de OverlayProvider.');
  return context;
}

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [modalStack, setModalStack] = useState<string[]>([]);
  const registerModal = useCallback((id: string) => {
    setModalStack((current) => current.includes(id) ? current : [...current, id]);
    return () => setModalStack((current) => current.filter((item) => item !== id));
  }, []);

  useEffect(() => {
    if (!host || modalStack.length === 0) return;
    const siblings = [...(host.parentElement?.children ?? [])]
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== host);
    const previous = siblings.map((element) => ({ element, inert: element.inert }));
    siblings.forEach((element) => { element.inert = true; });
    return () => previous.forEach(({ element, inert }) => { element.inert = inert; });
  }, [host, modalStack.length]);

  const value = useMemo(() => ({ host, modalStack, setHost, registerModal }), [host, modalStack, registerModal]);
  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}

export function OverlayHost() {
  const { setHost } = useOverlayContext();
  // El host vive dentro del shell para heredar las variables del tema, pero
  // debe formar una capa fija propia. Un `fixed` renderizado directamente en
  // una ruta animada queda atrapado por el `transform` de Motion y no puede
  // superar al top bar aunque su z-index numérico sea mayor.
  return <div ref={setHost} data-overlay-host className="layer-overlay pointer-events-none fixed inset-0 isolate" />;
}

export function OverlayPortal({ children }: { children: ReactNode }) {
  const { host } = useOverlayContext();
  return host ? createPortal(<div className="contents pointer-events-auto">{children}</div>, host) : null;
}

function focusableElements(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
    .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

interface ModalProps extends Omit<HTMLAttributes<HTMLDivElement>, 'aria-label'> {
  children: ReactNode;
  ariaLabel?: string;
  labelledBy?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  onClose?: () => void;
  semanticChild?: boolean;
}

export function Modal({
  children,
  ariaLabel,
  labelledBy,
  initialFocusRef,
  closeOnBackdrop = false,
  closeOnEscape = true,
  onClose,
  semanticChild = false,
  className,
  onMouseDown,
  ...props
}: ModalProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const { modalStack, registerModal } = useOverlayContext();
  const stackIndex = modalStack.indexOf(id);
  const isTop = stackIndex >= 0 && stackIndex === modalStack.length - 1;

  useLayoutEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return registerModal(id);
  }, [id, registerModal]);

  useEffect(() => {
    if (!isTop) return;
    const frame = window.requestAnimationFrame(() => {
      const root = rootRef.current;
      if (!root || root.contains(document.activeElement)) return;
      const target = initialFocusRef?.current
        ?? root.querySelector<HTMLElement>('[data-modal-initial-focus], [autofocus]')
        ?? focusableElements(root)[0]
        ?? root;
      target.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialFocusRef, isTop]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.inert = !isTop;
    return () => { root.inert = false; };
  }, [isTop]);

  useEffect(() => {
    if (!isTop) return;
    function onKeyDown(event: KeyboardEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (event.key === 'Escape' && closeOnEscape && onClose) {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusableElements(root);
      if (elements.length === 0) {
        event.preventDefault();
        root.focus({ preventScroll: true });
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [closeOnEscape, isTop, onClose]);

  useEffect(() => () => {
    const previous = previousFocusRef.current;
    if (previous?.isConnected) window.requestAnimationFrame(() => previous.focus({ preventScroll: true }));
  }, []);

  return <OverlayPortal>
    <div
      {...props}
      ref={rootRef}
      role={semanticChild ? undefined : 'dialog'}
      aria-modal={!semanticChild && isTop ? 'true' : undefined}
      aria-hidden={isTop ? undefined : true}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      data-overlay-modal
      data-overlay-top={isTop || undefined}
      tabIndex={-1}
      style={{ zIndex: 10 + Math.max(stackIndex, 0), ...props.style }}
      className={clsx('pointer-events-auto fixed inset-0', !isTop && 'pointer-events-none', className)}
      onMouseDown={(event) => {
        onMouseDown?.(event);
        if (!event.defaultPrevented && closeOnBackdrop && event.target === event.currentTarget) onClose?.();
      }}
    >
      {children}
    </div>
  </OverlayPortal>;
}

interface ModalPortalProps {
  children: ReactNode;
  onClose?: () => void;
  closeOnEscape?: boolean;
}

/** Adapta diálogos existentes al host y a la gestión común de foco sin alterar su superficie. */
export function ModalPortal({ children, onClose, closeOnEscape }: ModalPortalProps) {
  if (Children.toArray(children).length === 0) return null;
  return <Modal semanticChild onClose={onClose} closeOnEscape={closeOnEscape} className="bg-transparent">{children}</Modal>;
}

export function OverlayNotice({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <OverlayPortal><div {...props} className={clsx('layer-overlay-notice pointer-events-auto fixed', className)}>{children}</div></OverlayPortal>;
}
