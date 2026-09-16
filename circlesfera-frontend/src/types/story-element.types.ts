/**
 * Story composer canvas layer element.
 * Poll/qna persist via interactive API after story create.
 */
export interface StoryElement {
  id: string;
  type: 'text' | 'sticker' | 'poll' | 'qna';
  content: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  color?: string;
  bg?: string;
  textStyle?:
    | 'classic'
    | 'box'
    | 'box-shadow'
    | 'neon'
    | 'outline'
    | 'shadow'
    | 'retro';
  width?: number;
  align?: 'left' | 'center' | 'right';
  fontFamily?: string;
  fontSize?: number;
  letterSpacing?: number;
  opacity?: number;
  gradientColors?: [string, string];
  zIndex?: number;
}
