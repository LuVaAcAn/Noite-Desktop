import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  DEFAULT_CONTROLLER_MAPPING,
  type ControllerAction,
  type ControllerBinding,
  type ControllerMapping,
} from '@proyecto-noche/domain';
import { useSettings, useUpdateSettings } from './use-settings';
import { axisAction, controllerRouteFamilyIndex, controllerSectionRoutes } from '../lib/controller-utils';
import { playSound } from '../lib/sound-manager';

export interface GamepadSnapshot {
  index: number;
  id: string;
  mapping: GamepadMappingType;
  connected: boolean;
  timestamp: number;
  buttons: Array<{ pressed: boolean; value: number }>;
  axes: number[];
  hapticsSupported: boolean;
}

interface GamepadContextValue {
  supported: boolean;
  snapshots: GamepadSnapshot[];
  activeIndex: number | null;
  captureAction: ControllerAction | null;
  diagnosticsEnabled: boolean;
  testing: boolean;
  setDiagnosticsEnabled(enabled: boolean): void;
  setTesting(testing: boolean): void;
  beginCapture(action: ControllerAction): void;
  cancelCapture(): void;
  vibrate(index?: number): Promise<boolean>;
}

const GamepadContext = createContext<GamepadContextValue | null>(null);
const DIRECTION_ACTIONS: ControllerAction[] = ['up', 'down', 'left', 'right'];

function snapshot(gamepad: Gamepad): GamepadSnapshot {
  const extended = gamepad as Gamepad & { vibrationActuator?: unknown; hapticActuators?: unknown[] };
  return {
    index: gamepad.index,
    id: gamepad.id,
    mapping: gamepad.mapping,
    connected: gamepad.connected,
    timestamp: gamepad.timestamp,
    buttons: gamepad.buttons.map((button) => ({ pressed: button.pressed, value: button.value })),
    axes: [...gamepad.axes],
    hapticsSupported: !!extended.vibrationActuator || !!extended.hapticActuators?.[0],
  };
}

function topmostDialog() {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')]
    .filter((element) => element.offsetParent !== null && !element.inert && element.getAttribute('aria-hidden') !== 'true')
    .at(-1) ?? null;
}

function focusableElements(root: ParentNode = document) {
  return [...root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [role="button"], [data-controller-focus]')]
    .filter((element) => element.offsetParent !== null
      && !element.hasAttribute('data-controller-skip')
      && !element.closest('[aria-hidden="true"], [inert]'));
}

function moveFocus(direction: 'up' | 'down' | 'left' | 'right', originElement?: HTMLElement) {
  const dialog = topmostDialog();
  const root: ParentNode = dialog ?? document;
  const allElements = focusableElements(root);
  const previous = originElement ?? (document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
  const currentScope = previous?.closest<HTMLElement>('[data-controller-scope]');
  const scopedElements = currentScope && (!dialog || dialog.contains(currentScope)) ? focusableElements(currentScope) : allElements;
  const elements = scopedElements.length > 0 ? scopedElements : allElements;
  if (elements.length === 0) return;
  const current = previous && elements.includes(previous)
    ? previous
    : elements.find((element) => element.dataset.controllerSelected === 'true')
      ?? elements.find((element) => element.getAttribute('aria-current') === 'page')
      ?? elements[0];
  if (!previous || !elements.includes(previous)) {
    current.focus();
    return;
  }
  const origin = current.getBoundingClientRect();
  const ox = origin.left + origin.width / 2;
  const oy = origin.top + origin.height / 2;
  const candidates = elements.filter((element) => element !== current).map((element) => {
    const rect = element.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - ox;
    const dy = rect.top + rect.height / 2 - oy;
    const valid = direction === 'left' ? dx < -4 : direction === 'right' ? dx > 4 : direction === 'up' ? dy < -4 : dy > 4;
    const primary = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
    const cross = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    return { element, valid, score: primary + cross * 2.5 };
  }).filter((candidate) => candidate.valid).sort((a, b) => a.score - b.score);
  let target = candidates[0]?.element;
  if (!target && elements !== allElements) {
    const outside = allElements.filter((element) => !elements.includes(element));
    const fallbacks = outside.map((element) => {
      const rect = element.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - ox;
      const dy = rect.top + rect.height / 2 - oy;
      const valid = direction === 'left' ? dx < -4 : direction === 'right' ? dx > 4 : direction === 'up' ? dy < -4 : dy > 4;
      const primary = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
      const cross = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
      return { element, valid, score: primary + cross * 2.5 };
    }).filter((candidate) => candidate.valid).sort((a, b) => a.score - b.score);
    target = fallbacks[0]?.element;
  }
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function isEditing() {
  const element = document.activeElement;
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement || (element instanceof HTMLElement && element.isContentEditable);
}

export function GamepadProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const settingsQuery = useSettings();
  const { mutate: updateSettings } = useUpdateSettings();
  const [snapshots, setSnapshots] = useState<GamepadSnapshot[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [captureAction, setCaptureAction] = useState<ControllerAction | null>(null);
  const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(false);
  const [testing, setTesting] = useState(false);
  const activeIndexRef = useRef<number | null>(null);
  const lastMajorSection = useRef(0);
  const previousPressed = useRef(new Map<string, boolean>());
  const lastActionAt = useRef(new Map<ControllerAction, number>());
  const lastSnapshotAt = useRef(0);
  const connectionSignature = useRef('');
  const mapping: ControllerMapping = settingsQuery.data?.controllerMapping ?? DEFAULT_CONTROLLER_MAPPING;
  const deadZone = settingsQuery.data?.controllerDeadZone ?? 0.55;
  const enabled = settingsQuery.data?.controllerNavigationEnabled ?? true;
  const sectionRoutes = useMemo(() => controllerSectionRoutes(settingsQuery.data?.customCategories ?? []), [settingsQuery.data?.customCategories]);

  const performAction = useCallback((action: ControllerAction) => {
    document.documentElement.dataset.inputSource = 'controller';
    if (testing) {
      if (action === 'back') { playSound('back'); setTesting(false); }
      return;
    }
    if (isEditing()) {
      const editing = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      if (action === 'back' && editing) { playSound('back'); editing.blur(); }
      else if (DIRECTION_ACTIONS.includes(action) && editing) { editing.blur(); playSound('move'); moveFocus(action as 'up' | 'down' | 'left' | 'right', editing); }
      return;
    }
    if (action === 'confirm') {
      playSound('confirm');
      if (document.activeElement instanceof HTMLElement) document.activeElement.click();
      return;
    }
    if (action === 'back') {
      playSound('back');
      const dialog = topmostDialog();
      if (dialog) {
        const safeClose = [...dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])')].find((button) =>
          button.hasAttribute('data-dialog-close')
          || button.getAttribute('aria-label')?.toLocaleLowerCase('es').startsWith('cerrar')
          || button.textContent?.trim().toLocaleLowerCase('es') === 'cancelar'
        );
        if (safeClose) safeClose.click();
        else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      } else if (document.querySelector('[role="menu"]')) {
        document.querySelector<HTMLButtonElement>('button[aria-label^="Cerrar men"]')?.click();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      } else navigate(-1);
      return;
    }
    if (action === 'menu') {
      playSound('dialog');
      window.dispatchEvent(new CustomEvent('app-command-palette', { detail: { source: 'controller' } }));
      return;
    }
    if (action === 'previousSection' || action === 'nextSection') {
      const exact = controllerRouteFamilyIndex(location.pathname, sectionRoutes);
      if (exact >= 0) lastMajorSection.current = exact;
      const current = exact >= 0 ? exact : lastMajorSection.current;
      const offset = action === 'nextSection' ? 1 : -1;
      navigate(sectionRoutes[(current + offset + sectionRoutes.length) % sectionRoutes.length]);
      return;
    }
    if ((action === 'left' || action === 'right') && location.pathname.startsWith('/biblioteca/') && document.activeElement instanceof HTMLElement && document.activeElement.closest('[data-controller-section-nav]')) {
      const index = Math.max(0, controllerRouteFamilyIndex(location.pathname, sectionRoutes));
      const offset = action === 'right' ? 1 : -1;
      playSound('move');
      navigate(sectionRoutes[(index + offset + sectionRoutes.length) % sectionRoutes.length]);
      return;
    }
    if (DIRECTION_ACTIONS.includes(action)) {
      playSound('move');
      moveFocus(action as 'up' | 'down' | 'left' | 'right');
    }
  }, [location.pathname, navigate, sectionRoutes, testing]);

  useEffect(() => {
    if (!('getGamepads' in navigator)) return;
    let frame = 0;
    let stopped = false;
    const poll = () => {
      if (stopped) return;
      const pads = [...navigator.getGamepads()].filter((pad): pad is Gamepad => !!pad && pad.connected);
      const now = performance.now();
      const signature = pads.map((pad) => `${pad.index}:${pad.id}`).join('|');
      if (signature !== connectionSignature.current || (diagnosticsEnabled && now - lastSnapshotAt.current >= 33)) {
        connectionSignature.current = signature;
        lastSnapshotAt.current = now;
        setSnapshots(pads.map(snapshot));
      }
      let actionPad: Gamepad | undefined;
      for (const pad of pads) {
        const hasButtonEdge = pad.buttons.some((button, index) => button.pressed && !(previousPressed.current.get(`${pad.index}:${index}`) ?? false));
        const stick = axisAction(pad.axes, deadZone);
        if (hasButtonEdge || (stick && now - (lastActionAt.current.get(stick) ?? 0) > 180)) actionPad = pad;
      }
      if (actionPad && activeIndexRef.current !== actionPad.index) {
        activeIndexRef.current = actionPad.index;
        setActiveIndex(actionPad.index);
      }
      for (const pad of pads) {
        const pressedIndex = pad.buttons.findIndex((button) => button.pressed);
        if (!testing && captureAction && pressedIndex >= 0) {
          const key = `${pad.index}:${pressedIndex}`;
          if (!previousPressed.current.get(key)) {
            updateSettings({ controllerMapping: { ...mapping, [captureAction]: { type: 'button', index: pressedIndex } } });
            setCaptureAction(null);
          }
            activeIndexRef.current = pad.index;
            setActiveIndex(pad.index);
        } else if (enabled && document.hasFocus() && pad.index === (activeIndexRef.current ?? actionPad?.index ?? pads[0]?.index)) {
          (Object.entries(mapping) as Array<[ControllerAction, ControllerBinding]>).forEach(([action, binding]) => {
            const pressed = binding.type === 'button' && !!pad.buttons[binding.index]?.pressed;
            const key = `${pad.index}:${binding.index}`;
            const wasPressed = previousPressed.current.get(key) ?? false;
            const repeatable = action === 'up' || action === 'down' || action === 'left' || action === 'right';
            const last = lastActionAt.current.get(action) ?? 0;
            if (pressed && (!wasPressed || (repeatable && now - last > 180))) {
              performAction(action);
              lastActionAt.current.set(action, now);
            }
            previousPressed.current.set(key, pressed);
          });
          const stickAction = axisAction(pad.axes, deadZone);
          if (stickAction && now - (lastActionAt.current.get(stickAction) ?? 0) > 180) {
            performAction(stickAction);
            lastActionAt.current.set(stickAction, now);
          }
        }
        pad.buttons.forEach((button, index) => previousPressed.current.set(`${pad.index}:${index}`, button.pressed));
      }
      if (pads.length > 0 && document.hasFocus()) frame = requestAnimationFrame(poll);
    };
    const start = (event?: Event) => {
      if (event?.type === 'gamepadconnected') {
        playSound('controller');
        const tutorialSeen = localStorage.getItem('noite-controller-tutorial') === 'seen';
        window.dispatchEvent(new CustomEvent('app-toast', { detail: tutorialSeen ? 'Control conectado.' : 'Control conectado: cruceta para moverte, A para elegir, B para volver y Menu para comandos.' }));
        if (!tutorialSeen) localStorage.setItem('noite-controller-tutorial', 'seen');
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(poll);
    };
    const stop = () => { cancelAnimationFrame(frame); };
    window.addEventListener('gamepadconnected', start);
    window.addEventListener('gamepaddisconnected', start);
    window.addEventListener('focus', start);
    window.addEventListener('blur', stop);
    start();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('gamepadconnected', start);
      window.removeEventListener('gamepaddisconnected', start);
      window.removeEventListener('focus', start);
      window.removeEventListener('blur', stop);
    };
  }, [captureAction, deadZone, diagnosticsEnabled, enabled, mapping, performAction, testing, updateSettings]);

  const vibrate = useCallback(async (requestedIndex?: number) => {
    const pad = navigator.getGamepads?.()[requestedIndex ?? activeIndex ?? -1] as (Gamepad & { vibrationActuator?: { playEffect(type: string, params: object): Promise<string> }; hapticActuators?: Array<{ playEffect(type: string, params: object): Promise<string> }> }) | null;
    const actuator = pad?.vibrationActuator ?? pad?.hapticActuators?.[0];
    if (!actuator) return false;
    await actuator.playEffect('dual-rumble', { duration: 300, strongMagnitude: 0.75, weakMagnitude: 0.45 });
    return true;
  }, [activeIndex]);

  const value = useMemo<GamepadContextValue>(() => ({
    supported: 'getGamepads' in navigator,
    snapshots,
    activeIndex,
    captureAction,
    diagnosticsEnabled,
    testing,
    setDiagnosticsEnabled,
    setTesting,
    beginCapture: setCaptureAction,
    cancelCapture: () => setCaptureAction(null),
    vibrate,
  }), [activeIndex, captureAction, diagnosticsEnabled, snapshots, testing, vibrate]);

  return <GamepadContext.Provider value={value}>{children}</GamepadContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGamepads() {
  const value = useContext(GamepadContext);
  if (!value) throw new Error('useGamepads debe usarse dentro de GamepadProvider');
  return value;
}
