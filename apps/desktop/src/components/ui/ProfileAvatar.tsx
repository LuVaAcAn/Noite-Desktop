import { useEffect, useState } from 'react';
import { profileInitial } from '../../lib/profile-avatar';

export function ProfileAvatar({
  name,
  src,
  className = 'h-10 w-10',
  imageClassName = 'h-full w-full object-cover',
}: {
  name: string;
  src?: string | null;
  className?: string;
  imageClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-purple-800 font-bold text-white ${className}`}>
      {src && !failed
        ? <img src={src} alt="" className={imageClassName} onError={() => setFailed(true)} />
        : profileInitial(name)}
    </span>
  );
}
