"use client";

type Props = {
  src: string;
  position?: string;
  alt?: string;
  className?: string;
  onUnavailable?: () => void;
};

export function CoverPhoto({
  src,
  position,
  alt = "",
  className,
  onUnavailable,
}: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      draggable={false}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={onUnavailable}
      className={className}
      style={position ? { objectPosition: position } : undefined}
    />
  );
}
