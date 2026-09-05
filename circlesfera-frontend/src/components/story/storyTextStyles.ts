import type React from 'react';
import type { StoryElement } from '../../types';

function isNearWhite(color?: string): boolean {
  if (!color) return false;
  const c = color.trim().toLowerCase();
  if (c === '#fff' || c === '#ffffff' || c === 'white') return true;
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hex) return false;
  let r: number;
  let g: number;
  let b: number;
  if (hex[1].length === 3) {
    r = Number.parseInt(hex[1][0] + hex[1][0], 16);
    g = Number.parseInt(hex[1][1] + hex[1][1], 16);
    b = Number.parseInt(hex[1][2] + hex[1][2], 16);
  } else {
    r = Number.parseInt(hex[1].slice(0, 2), 16);
    g = Number.parseInt(hex[1].slice(2, 4), 16);
    b = Number.parseInt(hex[1].slice(4, 6), 16);
  }
  return (r + g + b) / 3 >= 240;
}

/** Crisp neon tube: tight core + colored bloom (white text uses brand tint so it doesn’t fog). */
export function neonTextShadow(color = '#FFFFFF'): string {
  const glow = isNearWhite(color) ? '#c4b5fd' : color;
  const core = isNearWhite(color) ? '#ffffff' : color;
  return [
    `0 0 1px ${core}`,
    `0 0 2px ${core}`,
    `0 0 6px ${glow}`,
    `0 0 12px ${glow}`,
    `0 0 22px ${glow}`,
    `0 0 36px ${glow}88`,
  ].join(', ');
}

export function getTextStyleCSS(el: StoryElement): React.CSSProperties {
  const base: React.CSSProperties = {
    color: el.color,
    fontFamily:
      el.type === 'text'
        ? `"${el.fontFamily || 'Outfit'}", sans-serif`
        : 'inherit',
    fontSize: el.fontSize ? `${el.fontSize}px` : '24px',
    letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : 'normal',
    width: el.width ? `${el.width}px` : 'auto',
    minWidth:
      el.textStyle === 'box' || el.textStyle === 'box-shadow'
        ? 'min-content'
        : undefined,
    maxWidth: el.width ? `${el.width}px` : '90%',
    textAlign: el.align || 'center',
    whiteSpace: 'pre-wrap',
    lineHeight: 1.2,
    opacity: el.opacity ?? 1,
  };

  if ((el.textStyle === 'box' || el.textStyle === 'box-shadow') && !el.width) {
    base.width = 'fit-content';
    base.maxWidth = '90%';
  }

  if (el.gradientColors && el.type === 'text') {
    base.background = `linear-gradient(135deg, ${el.gradientColors[0]}, ${el.gradientColors[1]})`;
    base.WebkitBackgroundClip = 'text';
    base.backgroundClip = 'text';
    base.WebkitTextFillColor = 'transparent';
    base.color = 'transparent';
  }

  switch (el.textStyle) {
    case 'neon':
      base.fontWeight = 700;
      base.textShadow = neonTextShadow(el.color || '#FFFFFF');
      if (!el.gradientColors) {
        base.WebkitTextFillColor = el.color || '#FFFFFF';
        base.color = el.color || '#FFFFFF';
      }
      break;
    case 'outline':
      base.WebkitTextStroke = `1.5px ${el.color}`;
      base.WebkitTextFillColor = el.gradientColors ? undefined : 'transparent';
      if (!el.gradientColors) base.color = 'transparent';
      break;
    case 'shadow':
      base.textShadow = `4px 4px 8px rgba(0,0,0,0.6), 0 0 20px rgba(0,0,0,0.3)`;
      break;
    case 'retro':
      base.textShadow = `3px 3px 0 rgba(0,0,0,0.4), -1px -1px 0 rgba(255,255,255,0.1)`;
      break;
    default:
      if (!el.gradientColors) base.textShadow = '0 2px 4px rgba(0,0,0,0.5)';
  }
  return base;
}
