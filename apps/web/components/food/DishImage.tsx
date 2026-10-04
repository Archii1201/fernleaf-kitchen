'use client';

import { useState } from 'react';
import { fileUrl } from '../../lib/api/client';
import { FoodPlaceholder } from './FoodPlaceholder';

/** Shows the stored dish photo, falling back to an illustration on any failure. */
export function DishImage({
  imageFileId,
  alt,
  className = 'h-40 w-full',
}: {
  imageFileId?: string | null;
  alt: string;
  className?: string;
}) {
  const [failedId, setFailedId] = useState<string | null>(null);

  if (!imageFileId || failedId === imageFileId) {
    return <FoodPlaceholder seed={alt} label={alt} className={className} />;
  }

  return (
    <div className={`overflow-hidden bg-[var(--cream-soft)] ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API file, not a static asset */}
      <img
        src={fileUrl(imageFileId)}
        alt={alt}
        loading="lazy"
        onError={() => setFailedId(imageFileId)}
        className="h-full w-full object-cover transition-transform duration-[350ms] hover:scale-[1.03]"
      />
    </div>
  );
}
