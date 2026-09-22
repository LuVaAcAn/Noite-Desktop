import { Fragment, type ReactNode } from 'react';
import { useSettings } from '../../hooks/use-settings';
import { setRuntimeLocale } from '../../lib/i18n-runtime';

export function LocaleBoundary({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const locale = settings.data?.locale ?? 'es';
  setRuntimeLocale(locale);
  return <Fragment key={locale}>{children}</Fragment>;
}
