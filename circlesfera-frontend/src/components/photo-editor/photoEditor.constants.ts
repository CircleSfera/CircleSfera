// Photo editor filter + adjustment presets (stepped Post/Frame composer).
// Keep names short for the filter strip; classes map to Tailwind + export pipeline.

export const PHOTO_FILTERS = [
  { name: 'Normal', class: '' },
  { name: 'Clarendon', class: 'brightness-110 contrast-125 saturate-125' },
  { name: 'Gingham', class: 'brightness-105 hue-rotate-350 contrast-90' },
  { name: 'Moon', class: 'grayscale brightness-110 contrast-110' },
  {
    name: 'Lark',
    class: 'brightness-105 contrast-90 saturate-125 sepia-[.15]',
  },
  {
    name: 'Reyes',
    class: 'sepia-[.20] brightness-110 contrast-85 saturate-75',
  },
  {
    name: 'Juno',
    class: 'contrast-115 brightness-115 saturate-140 sepia-[.15]',
  },
  { name: 'Slumber', class: 'brightness-105 saturate-65 sepia-[.20]' },
  { name: 'Crema', class: 'sepia-[.25] contrast-125 brightness-115' },
  { name: 'Ludwig', class: 'sepia-[.10] saturate-200 brightness-105' },
  {
    name: 'Aden',
    class: 'sepia-[.20] brightness-120 saturate-85 hue-rotate-340',
  },
  { name: 'Perpetua', class: 'contrast-110 brightness-125 saturate-110' },
] as const;

export type PhotoAdjustments = {
  brightness: number;
  contrast: number;
  saturation: number;
  sepia: number;
  grayscale: number;
  hue: number;
  blur: number;
  temperature: number;
  vignette: number;
  noise: number;
};

export const DEFAULT_PHOTO_ADJUSTMENTS: PhotoAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  sepia: 0,
  grayscale: 0,
  hue: 0,
  blur: 0,
  temperature: 100,
  vignette: 0,
  noise: 0,
};

export const PHOTO_ADJUSTMENT_CONFIG: {
  key: keyof PhotoAdjustments;
  labelKey: string;
  min: number;
  max: number;
  unit: string;
}[] = [
  {
    key: 'brightness',
    labelKey: 'brightness',
    min: 0,
    max: 200,
    unit: '%',
  },
  { key: 'contrast', labelKey: 'contrast', min: 0, max: 200, unit: '%' },
  {
    key: 'saturation',
    labelKey: 'saturation',
    min: 0,
    max: 200,
    unit: '%',
  },
  {
    key: 'temperature',
    labelKey: 'temperature',
    min: 0,
    max: 200,
    unit: '%',
  },
  { key: 'vignette', labelKey: 'vignette', min: 0, max: 100, unit: '%' },
  { key: 'noise', labelKey: 'noise', min: 0, max: 100, unit: '%' },
  { key: 'blur', labelKey: 'blur', min: 0, max: 10, unit: 'px' },
  { key: 'sepia', labelKey: 'sepia', min: 0, max: 100, unit: '%' },
  { key: 'grayscale', labelKey: 'grayscale', min: 0, max: 100, unit: '%' },
];
