import { useEffect, useState } from 'react';
import { LoaderCircle, Search, X } from 'lucide-react';
import { COVER_SEARCH_SUPPORTED_KINDS, CoverSearchError, type CoverSearchResult, type LibraryItemKind } from '@proyecto-noche/domain';
import { useCoverSearch } from '../../hooks/use-cover-search';
import { gradientFor } from '../../lib/placeholder-gradient';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Overlay';

interface CoverSearchModalProps {
  initialQuery: string;
  kind: LibraryItemKind;
  onClose: () => void;
  onSelect: (result: CoverSearchResult) => void | Promise<void>;
}

export function CoverSearchModal({ initialQuery, kind, onClose, onSelect }: CoverSearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const search = useCoverSearch();
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const supported = COVER_SEARCH_SUPPORTED_KINDS.includes(kind);

  function runSearch(term: string) {
    if (!term.trim() || !supported) return;
    search.mutate({ query: term, kind });
  }

  // Busca automáticamente al abrir, con el nombre que ya escribió en el
  // formulario — así no hay que repetir el término dos veces.
  useEffect(() => {
    runSearch(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal ariaLabel="Buscar portada" data-controller-scope="dialog" className="flex items-start justify-center overflow-y-auto bg-black/70 p-6 pt-16" closeOnBackdrop onClose={onClose}>
      <div className="w-full max-w-3xl rounded-2xl border border-noche-border bg-noche-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-noche-border p-4">
          <Search size={18} className="text-noche-muted" />
          <input
            data-controller-skip
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch(query)}
            placeholder="Buscar título…"
            className="flex-1 bg-transparent text-noche-text placeholder:text-noche-muted focus:outline-none"
          />
          <button
            autoFocus
            onClick={() => runSearch(query)}
            disabled={search.isPending || applying}
            className="rounded-pill bg-noche-text px-4 py-1.5 text-sm font-semibold text-noche-bg hover:brightness-90 disabled:cursor-wait disabled:opacity-60"
          >
            {search.isPending ? 'Buscando…' : 'Buscar'}
          </button>
          <button
            aria-label="Cerrar"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-noche-muted hover:bg-noche-surface-hover hover:text-noche-text"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          {!supported && (
            <p className="py-10 text-center text-sm text-noche-muted">
              Este tipo de actividad no tiene un proveedor automático de portadas todavía. Usa
              "Adjuntar portada" para subir una imagen manualmente.
            </p>
          )}

          {search.isPending && (
            <div role="status"><div className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-noche-border bg-noche-bg p-3 text-sm text-noche-muted"><LoaderCircle className="animate-spin" size={17} /> Buscando en {['movie', 'series', 'season_or_episode'].includes(kind) ? 'TMDB' : 'IGDB'}…</div><div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-noche-surface" />
              ))}
            </div></div>
          )}

          {applying && <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-noche-muted"><LoaderCircle className="animate-spin" size={18} /> Guardando portada…</div>}
          {applyError && <div role="alert" className="py-5 text-center text-sm text-red-500">{applyError}<div><Button className="mt-3" size="sm" variant="ghost" onClick={() => setApplyError(null)}>Volver a resultados</Button></div></div>}

          {search.isError && (
            <div className="py-10 text-center text-sm">
              <p className="text-red-600">No se pudo buscar: {search.error instanceof Error ? search.error.message : 'error desconocido'}</p>
              {search.error instanceof CoverSearchError && search.error.code === 'auth_required' ? <p className="mt-2 text-noche-muted">Revisa tus credenciales en Ajustes → Portadas y reintenta.</p> : search.error instanceof CoverSearchError && search.error.code === 'provider_rate_limited' ? <p className="mt-2 text-noche-muted">Espera {search.error.retryAfterSeconds ?? 60} segundos y vuelve a buscar.</p> : <p className="mt-2 text-noche-muted">Puedes reintentar, adjuntar una imagen o continuar sin portada.</p>}
              <div className="mt-4 flex justify-center gap-2"><Button size="sm" variant="secondary" onClick={onClose}>Adjuntar portada</Button><Button size="sm" variant="ghost" onClick={onClose}>Continuar sin portada</Button></div>
            </div>
          )}

          {search.isSuccess && supported && search.data.length === 0 && (
            <p className="py-10 text-center text-sm text-noche-muted">Sin resultados para "{query}".</p>
          )}

          {search.isSuccess && search.data.length > 0 && !applying && !applyError && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {search.data.map((result) => (
                <button
                  key={`${result.externalProvider}-${result.externalId}`}
                  disabled={applying}
                  onClick={() => void (async () => { setApplying(true); setApplyError(null); try { await onSelect(result); } catch (cause) { setApplyError(cause instanceof Error ? cause.message : 'Noite no pudo guardar la portada.'); } finally { setApplying(false); } })()}
                  className="group text-left"
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-[14px] border border-noche-border bg-noche-surface transition group-hover:border-[rgb(var(--theme-accent))]">
                    <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br p-3 text-center text-xs font-semibold text-white ${gradientFor(result.title)}`}>{result.title}</div>
                    {result.coverUrl ? (
                      <img src={result.coverUrl} alt={result.title} className="relative h-full w-full object-cover opacity-0 [animation:cover-in_.18s_ease_forwards]" onError={(event) => { event.currentTarget.hidden = true; }} />
                    ) : null}
                  </div>
                  <p className="mt-1.5 line-clamp-1 text-xs font-medium text-noche-text">{result.title}</p>
                  <p className="text-[11px] text-noche-muted">{result.year ? `${result.year} · ` : ''}{result.providerLabel}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
