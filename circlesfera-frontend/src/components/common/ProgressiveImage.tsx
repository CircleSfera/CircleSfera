import { useEffect, useState } from 'react';

interface ProgressiveImageProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  placeholderSrc?: string;
  src: string;
}

export default function ProgressiveImage({
  placeholderSrc,
  src,
  className = '',
  alt,
  ...props
}: ProgressiveImageProps) {
  const [imgSrc, setImgSrc] = useState(placeholderSrc || src);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // If there is no placeholder or it's the same as src, mark as loaded
    if (!placeholderSrc || placeholderSrc === src) {
      setImgSrc(src);
      setIsLoaded(true);
      return;
    }

    // Reset state if src changes
    setImgSrc(placeholderSrc);
    setIsLoaded(false);

    const img = new Image();
    img.src = src;

    // Support srcset if provided via props
    if (props.srcSet) {
      img.srcset = props.srcSet;
    }
    if (props.sizes) {
      img.sizes = props.sizes;
    }

    img.onload = () => {
      setImgSrc(src);
      setIsLoaded(true);
    };
  }, [src, placeholderSrc, props.srcSet, props.sizes]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* 
        To prevent blurred edges from bleeding out, we add a slight scale to the blurred image 
        and wrap it in an overflow-hidden container.
      */}
      <img
        {...props}
        src={imgSrc}
        alt={alt}
        className={`
          w-full h-full object-cover transition-[filter,transform,opacity] duration-500 ease-out
          ${!isLoaded ? 'blur-xl scale-110 opacity-70' : 'blur-0 scale-100 opacity-100'}
        `}
      />
    </div>
  );
}
