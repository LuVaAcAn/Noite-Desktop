import { useState } from 'react';
import { useGameInstallations, useLaunchGame, useSetPreferredGameInstallation } from './use-game-discovery';

export function useGameLaunchActions(itemIds: string[]) {
  const installations = useGameInstallations(itemIds);
  const launch = useLaunchGame();
  const preferred = useSetPreferredGameInstallation();
  const [chooserItemId, setChooserItemId] = useState<string | null>(null);
  const forItem = (itemId: string) => installations.data?.filter((item) => item.libraryItemId === itemId && item.available && item.launchable) ?? [];

  function launchForItem(itemId: string) {
    const choices = forItem(itemId);
    if (choices.length === 0) return;
    const selected = choices.find((item) => item.preferred);
    if (selected || choices.length === 1) launch.mutate((selected ?? choices[0]).installationId);
    else setChooserItemId(itemId);
  }

  async function choose(installationId: string, remember: boolean) {
    if (remember) await preferred.mutateAsync(installationId);
    await launch.mutateAsync(installationId);
    setChooserItemId(null);
  }

  return {
    loading: installations.isLoading,
    launchError: launch.error,
    hasLaunchable: (itemId: string) => forItem(itemId).length > 0,
    hasUnavailable: (itemId: string) => installations.data?.some((item) => item.libraryItemId === itemId && !item.available) ?? false,
    launchForItem,
    chooserItemId,
    chooserInstallations: chooserItemId ? forItem(chooserItemId) : [],
    closeChooser: () => setChooserItemId(null),
    choose,
    choosing: launch.isPending || preferred.isPending,
  };
}
