import { Camera } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArcadeLottie } from './ArcadeLottie';

export function GalleryFab() {
  const navigate = useNavigate();
  const location = useLocation();
  if (location.pathname === '/galeria' || location.pathname === '/bienvenida') return null;
  return <button data-controller-scope="actions" aria-label="Abrir galería global" onClick={() => navigate('/galeria')} className="layer-floating group fixed bottom-11 right-[var(--shell-gutter)] flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-noche-border bg-[rgb(var(--theme-accent))] text-white shadow-[0_0_18px_rgb(var(--theme-accent)/.28)] transition-transform duration-150 hover:scale-[1.04] active:scale-[.98] focus-visible:scale-[1.04]">
    <ArcadeLottie variant="gallery" className="absolute inset-0 h-full w-full opacity-10" />
    <Camera size={22} className="relative z-10" />
  </button>;
}
