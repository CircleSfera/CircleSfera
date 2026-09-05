import { useEffect, useRef, useState } from 'react';
import { pickNativeImage } from '../../utils/nativeFilePicker';
import { GRADIENTS } from './storyComposer.constants';

export function useStoryBackground(options: {
  initialMedia?: File | null;
  initialBgStyle?: string;
  onBgStyleChange?: (style: string) => void;
  onBackgroundChange?: (file: File) => void;
}) {
  const {
    initialMedia,
    initialBgStyle = GRADIENTS[0],
    onBgStyleChange,
    onBackgroundChange,
  } = options;

  const isTextStoryEntry = !initialMedia && !initialBgStyle;
  const [background, setBackground] = useState<File | null>(
    initialMedia || null,
  );
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(
    initialMedia ? URL.createObjectURL(initialMedia) : null,
  );
  const [bgStyle, setInternalBgStyle] = useState<string>(
    initialBgStyle || (isTextStoryEntry ? GRADIENTS[0] : ''),
  );
  const [bgBlur, setBgBlur] = useState(0);
  const [bgDarken, setBgDarken] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialMedia) {
      setBackground(initialMedia);
      setBackgroundUrl(URL.createObjectURL(initialMedia));
    }
  }, [initialMedia]);

  const didSyncDefaultBg = useRef(false);
  useEffect(() => {
    if (didSyncDefaultBg.current) return;
    if (isTextStoryEntry && bgStyle) {
      didSyncDefaultBg.current = true;
      onBgStyleChange?.(bgStyle);
    }
  }, [isTextStoryEntry, bgStyle, onBgStyleChange]);

  const setBgStyle = (style: string) => {
    setInternalBgStyle(style);
    onBgStyleChange?.(style);
  };

  const clearMediaBackground = () => {
    setBackground(null);
    setBackgroundUrl(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setBackground(file);
      setBackgroundUrl(URL.createObjectURL(file));
      setBgStyle('');
      onBackgroundChange?.(file);
    }
  };

  const handleUploadBackground = async (e?: {
    preventDefault?: () => void;
  }) => {
    e?.preventDefault?.();
    const handled = await pickNativeImage(fileInputRef);
    if (!handled) fileInputRef.current?.click();
  };

  const handleSelectGradient = (grad: string) => {
    setBgStyle(grad);
    clearMediaBackground();
  };

  return {
    background,
    backgroundUrl,
    bgStyle,
    setBgStyle,
    bgBlur,
    setBgBlur,
    bgDarken,
    setBgDarken,
    fileInputRef,
    clearMediaBackground,
    handleFileChange,
    handleUploadBackground,
    handleSelectGradient,
  };
}
