'use client';

import { useState } from 'react';
import { fileUrl } from '../../lib/api/client';
import { Icon } from './Icon';

export function FoodPlaceholder({ className = 'h-full w-full' }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center bg-[var(--cream-soft)] text-[var(--muted)]/50 ${className}`}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center gap-1">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-white/70 shadow-sm text-[var(--orange-deep)]/70">
          <Icon name="camera" className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

export function DishImage({
  imageFileId,
  alt = 'Dish image',
  className = 'h-40 w-full',
}: {
  imageFileId?: string | null;
  alt?: string;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);

  if (!imageFileId || errored) {
    return <FoodPlaceholder className={className} />;
  }

  return (
    <div className={`relative overflow-hidden bg-[var(--cream-soft)] ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={fileUrl(imageFileId)}
        alt={alt}
        onError={() => setErrored(true)}
        className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
        loading="lazy"
      />
    </div>
  );
}
