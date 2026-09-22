import { describe, expect, it } from 'vitest';
import { axisAction, controllerRouteFamilyIndex, controllerSectionRoutes, controllerSelection, normalizeAxis, rememberControllerSelection } from './controller-utils';

describe('controller utilities', () => {
  it('filters stick drift and normalizes values outside the dead zone', () => {
    expect(normalizeAxis(0.3, 0.55)).toBe(0);
    expect(normalizeAxis(-0.55, 0.55)).toBeCloseTo(0);
    expect(normalizeAxis(1, 0.55)).toBe(1);
    expect(normalizeAxis(-1, 0.55)).toBe(-1);
  });

  it('chooses the dominant stick direction', () => {
    expect(axisAction([0.9, 0.2], 0.5)).toBe('right');
    expect(axisAction([-0.8, 0.6], 0.5)).toBe('left');
    expect(axisAction([0.1, -0.9], 0.5)).toBe('up');
    expect(axisAction([0.2, 0.3], 0.5)).toBeNull();
  });

  it('preserves the selected element for a focus scope', () => {
    expect(controllerSelection('juegos')).toBeNull();
    rememberControllerSelection('juegos', 'game-42');
    expect(controllerSelection('juegos')).toBe('game-42');
  });

  it('resolves shoulder navigation by route family', () => {
    const routes = controllerSectionRoutes([{ id: 'lecturas' }, { id: 'viajes' }]);
    expect(routes).toEqual(['/', '/biblioteca/juegos', '/biblioteca/peliculas', '/biblioteca/series', '/biblioteca/favoritos', '/biblioteca/lecturas', '/biblioteca/viajes', '/musica', '/calendario', '/sesion']);
    expect(controllerRouteFamilyIndex('/biblioteca/juegos/todos', routes)).toBe(1);
    expect(controllerRouteFamilyIndex('/biblioteca/lecturas', routes)).toBe(5);
    expect(controllerRouteFamilyIndex('/musica', routes)).toBe(7);
    expect(controllerRouteFamilyIndex('/buscar')).toBe(-1);
    expect(controllerRouteFamilyIndex('/biblioteca/item/item-1')).toBe(-1);
  });
});
