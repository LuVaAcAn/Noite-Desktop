import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ArcadeLottie } from './ArcadeLottie';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-noche-border py-10 text-center">
      <ArcadeLottie className="-mb-5 h-24 w-24" />
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-noche-surface">
        <Icon size={24} className="text-noche-muted" />
      </div>
      <p className="font-display text-lg font-semibold text-noche-text">{title}</p>
      {description && <p className="max-w-sm text-sm text-noche-muted">{description}</p>}
      {action}
    </div>
  );
}
