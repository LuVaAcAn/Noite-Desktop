import { ArrowLeft, ArrowRight } from 'lucide-react';
import clsx from 'clsx';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

function buildPageList(page: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const pages = new Set<number>([1, 2, totalPages - 1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const result: (number | 'ellipsis')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push('ellipsis');
    result.push(p);
  });
  return result;
}

export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;
  const pages = buildPageList(page, totalPages);

  return (
    <div className="flex items-center gap-2">
      {pages.map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`ellipsis-${i}`} className="px-1 text-noche-muted">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={clsx(
              'h-9 w-9 rounded-lg text-sm font-semibold transition',
              p === page ? 'bg-white text-noche-bg' : 'bg-noche-surface text-noche-text hover:bg-noche-surface-hover'
            )}
          >
            {p}
          </button>
        )
      )}
      <div className="ml-2 flex items-center gap-2">
        <button
          aria-label="Página anterior"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-noche-surface text-noche-text hover:bg-noche-surface-hover disabled:opacity-40"
        >
          <ArrowLeft size={16} />
        </button>
        <button
          aria-label="Página siguiente"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-noche-surface text-noche-text hover:bg-noche-surface-hover disabled:opacity-40"
        >
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
