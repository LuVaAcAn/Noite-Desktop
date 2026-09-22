import { BookOpen, BriefcaseBusiness, Clapperboard, Gamepad2, Globe2, GraduationCap, Heart, MessageCircle, MoreHorizontal, Music2, Palette, Shapes, Tv } from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import type { LibraryItem, LibraryItemKind } from '@proyecto-noche/domain';
import { gradientFor } from '../../lib/placeholder-gradient';

const KIND_ICON: Record<LibraryItemKind, typeof Gamepad2> = {
  movie: Clapperboard,
  series: Tv,
  season_or_episode: Tv,
  video_game: Gamepad2,
  creative_activity: Palette,
  music_listening: Music2,
  themed_conversation: MessageCircle,
  reading: BookOpen,
  study: GraduationCap,
  parallel_work: BriefcaseBusiness,
  browser_game: Globe2,
  custom: Shapes,
  other: Shapes,
};

// Tipos "tipo consola" (juegos) se ven como cuadrado, al estilo de los
// íconos de canal de Wii U — punto 4 del feedback: "los juegos como
// cuadrados... y las series como rectángulos un poco más pequeños".
const SQUARE_KINDS: LibraryItemKind[] = ['video_game', 'browser_game'];

const STATUS_LABEL: Record<LibraryItem['status'], string> = {
  idea: 'Idea',
  pending: 'Pendiente',
  planned: 'Planeado',
  in_progress: 'En curso',
  paused: 'Pausado',
  completed: 'Completado',
  abandoned: 'Abandonado',
  archived: 'Archivado',
};

interface LibraryItemCardProps {
  item: LibraryItem;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onContextMenu: (position: { clientX: number; clientY: number }) => void;
  /** 'preview': tamaño uniforme más grande (Inicio, vista previa de categoría).
   *  'compact': tamaño de la vista "Todos" — cuadrado para juegos, rectángulo
   *  más chico para el resto, como pidió el punto 4 del feedback. */
  size?: 'preview' | 'compact';
  selected?: boolean;
  reflection?: boolean;
  onFocus?: () => void;
}

export function LibraryItemCard({ item, onOpen, onToggleFavorite, onContextMenu, size = 'preview', selected = false, reflection = false, onFocus }: LibraryItemCardProps) {
  const Icon = KIND_ICON[item.kind];
  const isSquare = size === 'compact' && SQUARE_KINDS.includes(item.kind);
  const aspectClass = isSquare ? 'aspect-square' : size === 'compact' ? 'aspect-[3/4]' : 'aspect-[2/3]';

  return (
    <div
      className={clsx('relative transition duration-300 ease-out hover:z-20 hover:scale-[1.075] focus-within:z-20 focus-within:scale-[1.075]', aspectClass, selected && 'z-20 scale-[1.065]')}
    >
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu({ clientX: e.clientX, clientY: e.clientY });
      }}
      className={clsx(
        'group relative h-full overflow-hidden rounded-[14px] border bg-noche-surface shadow-card transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-2xl',
        selected ? 'border-[rgb(var(--theme-accent))] shadow-[0_0_28px_rgba(var(--theme-accent),0.42)] ring-2 ring-[rgb(var(--theme-accent))]' : 'border-noche-border'
      )}
    >
      <button type="button" data-controller-id={item.id} data-controller-selected={selected || undefined} aria-label={`Abrir ${item.title}`} onClick={onOpen} onFocus={onFocus} className="absolute inset-0 z-10 cursor-pointer" />
      <CardCover src={item.coverUrl} title={item.title} />
      <Icon
        size={72}
        strokeWidth={1}
        className="absolute -bottom-3 -right-3 text-white/15 transition group-hover:text-white/25"
      />

      <button
        aria-label={item.isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 backdrop-blur transition hover:bg-black/60"
      >
        <Heart size={16} fill={item.isFavorite ? '#ec4899' : 'none'} color={item.isFavorite ? '#ec4899' : 'white'} />
      </button>

      <button
        type="button"
        aria-label={`Más acciones para ${item.title}`}
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          onContextMenu({ clientX: rect.right, clientY: rect.bottom });
        }}
        className="absolute right-2 top-12 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
      >
        <MoreHorizontal size={16} />
      </button>

      <span className="absolute left-2 top-2 rounded-pill bg-black/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/80 backdrop-blur">
        {STATUS_LABEL[item.status]}
      </span>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-8">
        <p className="line-clamp-2 font-display text-sm font-semibold text-white">{item.title}</p>
      </div>
    </div>
    {reflection && <div aria-hidden="true" className="pointer-events-none absolute inset-x-1 top-[101%] h-[27%] origin-top scale-y-[-1] overflow-hidden rounded-[14px] opacity-[.14] blur-[1.5px] [mask-image:linear-gradient(to_bottom,black,transparent)]">
      {item.coverUrl ? <img src={item.coverUrl} alt="" className="h-[370%] w-full object-cover object-top" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <div className={clsx('h-[370%] bg-gradient-to-br', gradientFor(item.title))} />}
    </div>}
    </div>
  );
}

function CardCover({ src, title }: { src: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <div className={clsx('absolute inset-0 bg-gradient-to-br', gradientFor(title))} />;
  return <img src={src} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-200 [animation:cover-in_.2s_ease-out_forwards]" onError={() => setFailed(true)} />;
}
