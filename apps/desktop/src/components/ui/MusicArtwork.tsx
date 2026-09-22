import { useEffect, useState } from 'react';
import { Music2 } from 'lucide-react';

export function MusicArtwork({ src, alt = '', className = 'h-full w-full object-cover', iconClassName = 'text-noche-muted' }: { src?: string | null; alt?: string; className?: string; iconClassName?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <Music2 aria-hidden="true" className={iconClassName} />;
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} referrerPolicy="no-referrer" />;
}
