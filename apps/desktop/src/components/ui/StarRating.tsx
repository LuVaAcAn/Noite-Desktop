import { useState } from 'react';
import { Star } from 'lucide-react';

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  readOnly?: boolean;
}

export function StarRating({ value, onChange, size = 22, readOnly = false }: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const display = hovered ?? value;

  return (
    <div
      className="flex items-center gap-1"
      role={readOnly ? undefined : 'radiogroup'}
      aria-label="Calificación"
      onMouseLeave={() => setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const icon = <Star size={size} fill={star <= display ? '#facc15' : 'transparent'} color={star <= display ? '#facc15' : '#4b4b57'} strokeWidth={1.5} />;
        return readOnly ? <span key={star} aria-hidden="true">{icon}</span> : (
          <button key={star} type="button" role="radio" aria-checked={star === value} aria-label={`${star} de 5 estrellas`} onMouseEnter={() => setHovered(star)} onClick={() => onChange?.(star)} className="cursor-pointer transition hover:scale-110">
            {icon}
          </button>
        );
      })}
    </div>
  );
}
