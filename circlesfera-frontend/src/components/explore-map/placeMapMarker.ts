import type { PlaceMapPin } from '../../types';

type PlaceMapMarkerProps = {
  place: PlaceMapPin;
  selected: boolean;
  moreLabel: string;
  onSelect: (placeId: string) => void;
};

const BRAND = '#8c52ff';

export function buildPlaceMarkerElement({
  place,
  selected,
  moreLabel,
  onSelect,
}: PlaceMapMarkerProps): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'explore-map-marker';
  btn.setAttribute('aria-label', place.name);
  btn.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'gap:5px',
    'border:none',
    'background:transparent',
    'padding:0',
    'cursor:pointer',
    'transform:translateY(-4px)',
    'transition:transform 160ms ease',
    selected ? 'z-index:3' : 'z-index:1',
  ].join(';');

  const size = selected ? 58 : 50;
  const thumb = document.createElement('span');
  thumb.style.cssText = [
    'display:block',
    `width:${size}px`,
    `height:${size}px`,
    'border-radius:9999px',
    'overflow:hidden',
    selected
      ? `border:3px solid ${BRAND}; outline:2px solid rgba(255,255,255,0.92); outline-offset:1px`
      : 'border:2px solid rgba(255,255,255,0.88)',
    selected
      ? `box-shadow:0 6px 20px rgba(140,82,255,0.55), 0 2px 8px rgba(0,0,0,0.5)`
      : 'box-shadow:0 4px 14px rgba(0,0,0,0.5)',
    'background:#141414',
  ].join(';');

  if (place.markerImageUrl) {
    const img = document.createElement('img');
    img.src = place.markerImageUrl;
    img.alt = '';
    img.decoding = 'async';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
    thumb.appendChild(img);
  }

  const label = document.createElement('span');
  label.style.cssText = [
    'max-width:128px',
    'padding:3px 9px',
    'border-radius:9999px',
    selected
      ? 'background:rgba(140,82,255,0.92)'
      : 'background:rgba(0,0,0,0.78)',
    'color:#fff',
    'font-family:Inter,system-ui,sans-serif',
    'font-size:11px',
    'font-weight:600',
    'letter-spacing:-0.01em',
    'line-height:1.2',
    'text-align:center',
    'white-space:nowrap',
    'overflow:hidden',
    'text-overflow:ellipsis',
    'pointer-events:none',
    selected
      ? 'box-shadow:0 4px 12px rgba(140,82,255,0.4)'
      : 'box-shadow:0 2px 8px rgba(0,0,0,0.35)',
  ].join(';');

  const extra =
    place.postCount > 1
      ? ` ${moreLabel.replace('{{count}}', String(place.postCount - 1))}`
      : '';
  label.textContent = `${place.name}${extra}`;

  btn.appendChild(thumb);
  btn.appendChild(label);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onSelect(place.id);
  });

  return btn;
}
