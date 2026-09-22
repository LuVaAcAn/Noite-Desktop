import { MutationCache, QueryClient } from '@tanstack/react-query';
import { localizeNativeError } from './i18n-runtime';

export const queryClient = new QueryClient({
  // The core repositories are local: losing Internet must never pause writes
  // or the subsequent settings/space refresh indefinitely.
  defaultOptions: {
    queries: { networkMode: 'always', retry: 1, refetchOnWindowFocus: false },
    mutations: { networkMode: 'always' },
  },
  mutationCache: new MutationCache({
    onError: (error) => window.dispatchEvent(new CustomEvent('app-error', { detail: localizeNativeError(error).message })),
  }),
});
