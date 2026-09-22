import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import type { ControllerFocusScope as ScopeName } from '@proyecto-noche/domain';

export function ControllerFocusScope<T extends ElementType = 'div'>({ as, scope, children, ...props }: { as?: T; scope: ScopeName; children: ReactNode } & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children'>) {
  const Component = as ?? 'div';
  return <Component data-controller-scope={scope} {...props}>{children}</Component>;
}
