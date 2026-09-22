import type { ControllerAction } from '@proyecto-noche/domain';

const rememberedSelections = new Map<string, string>();
export function controllerSectionRoutes(customCategories: ReadonlyArray<{ id: string }> = []): string[] {
  return ['/', '/biblioteca/juegos', '/biblioteca/peliculas', '/biblioteca/series', '/biblioteca/favoritos', ...customCategories.map((category) => `/biblioteca/${category.id}`), '/musica', '/calendario', '/sesion'];
}

export function controllerRouteFamilyIndex(pathname: string, routes = controllerSectionRoutes()): number {
  return routes.findIndex((route) => route === pathname || (route !== '/' && pathname.startsWith(`${route}/`)));
}

export function rememberControllerSelection(scopeId: string, elementId: string) {
  rememberedSelections.set(scopeId, elementId);
}

export function controllerSelection(scopeId: string): string | null {
  return rememberedSelections.get(scopeId) ?? null;
}

export function normalizeAxis(value: number, deadZone: number): number {
  const clampedZone = Math.min(0.95, Math.max(0, deadZone));
  const magnitude = Math.abs(value);
  if (magnitude < clampedZone) return 0;
  const normalized = Math.min(1, (magnitude - clampedZone) / (1 - clampedZone));
  return Math.sign(value) * normalized;
}

export function axisAction(axes: readonly number[], deadZone: number): ControllerAction | null {
  const horizontal = normalizeAxis(axes[0] ?? 0, deadZone);
  const vertical = normalizeAxis(axes[1] ?? 0, deadZone);
  if (Math.abs(horizontal) > Math.abs(vertical)) {
    return horizontal < 0 ? 'left' : horizontal > 0 ? 'right' : null;
  }
  return vertical < 0 ? 'up' : vertical > 0 ? 'down' : null;
}
