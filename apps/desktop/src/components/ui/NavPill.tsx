import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

interface NavPillProps {
  label: string;
  icon: LucideIcon | string;
  active?: boolean;
  activeColorClass: string;
  activeColorHex?: string;
  onClick: () => void;
}

export function NavPill({
  label,
  icon,
  active,
  activeColorClass,
  activeColorHex,
  onClick,
}: NavPillProps) {
  const isEmoji = typeof icon === 'string';
  const Icon = isEmoji ? null : icon;

  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      style={active && activeColorHex ? { backgroundColor: activeColorHex, borderColor: 'transparent' } : undefined}
      onClick={onClick}
      className={clsx(
        'arcade-focus inline-flex shrink-0 items-center gap-2 rounded-[11px] border px-4 py-2 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-150 focus-visible:scale-[1.03] active:scale-[.98]',
        active
          ? clsx(activeColorHex ? '' : activeColorClass, 'border-transparent text-white')
          : 'border-noche-border bg-noche-surface text-noche-text hover:border-[rgb(var(--theme-accent))] hover:text-[rgb(var(--theme-accent))]'
      )}
    >
      {isEmoji ? (
        <span className="text-base leading-none">{icon}</span>
      ) : (
        Icon && <Icon size={16} strokeWidth={2.5} />
      )}

      {label}
    </button>
  );
}
