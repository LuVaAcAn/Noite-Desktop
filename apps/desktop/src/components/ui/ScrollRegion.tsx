import type { CSSProperties, ElementType, ReactNode } from 'react';
import clsx from 'clsx';

interface ScrollRegionProps {
  children: ReactNode;
  label: string;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}

export function ScrollRegion({ children, label, as: Component = 'main', className, style }: ScrollRegionProps) {
  return (
    <Component
      aria-label={label}
      tabIndex={0}
      className={clsx('h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain focus:outline-none', className)}
      style={style}
    >
      {children}
    </Component>
  );
}
