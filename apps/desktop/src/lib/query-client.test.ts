import { afterEach, expect, it } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { queryClient } from './query-client';

afterEach(() => { onlineManager.setOnline(true); queryClient.clear(); });

it('permite guardar y refrescar datos locales sin Internet', async () => {
  onlineManager.setOnline(false);
  const mutation = queryClient.getMutationCache().build(queryClient, {
    mutationFn: async () => 'guardado',
  });
  expect(await mutation.execute(undefined)).toBe('guardado');
  expect(await queryClient.fetchQuery({ queryKey: ['offline-test'], queryFn: async () => 'actualizado' })).toBe('actualizado');
});
