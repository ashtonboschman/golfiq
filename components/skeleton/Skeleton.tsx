'use client';

import type { ReactNode } from 'react';

type Dimension = number | string;

function joinClassNames(...classNames: Array<string | undefined | false>) {
  return classNames.filter(Boolean).join(' ');
}

function dimensionClass(prefix: 'u-w' | 'u-h' | 'u-mt', value?: Dimension): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'number') return `${prefix}-${value}`;
  const normalized = value.trim().replace('%', 'pct-').replace(/\./g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  return normalized ? `${prefix}-${normalized}` : undefined;
}

type SkeletonBlockProps = {
  className?: string;
  width?: Dimension;
  height?: Dimension;
  inline?: boolean;
  center?: boolean;
  rounded?: 'pill';
  mt?: Dimension;
};

export function SkeletonBlock({ className, width, height, inline, center, rounded, mt }: SkeletonBlockProps) {
  return (
    <div
      aria-hidden="true"
      className={joinClassNames(
        'skeleton',
        className,
        dimensionClass('u-w', width),
        dimensionClass('u-h', height),
        dimensionClass('u-mt', mt),
        inline ? 'u-inline-block' : undefined,
        center ? 'u-mx-auto' : undefined,
        rounded === 'pill' ? 'u-rounded-pill' : undefined,
      )}
    />
  );
}

type SkeletonCircleProps = {
  className?: string;
  size?: Dimension;
};

export function SkeletonCircle({ className, size = 36 }: SkeletonCircleProps) {
  return (
    <SkeletonBlock
      className={joinClassNames('skeleton-circle', className)}
      width={size}
      height={size}
      rounded="pill"
    />
  );
}

type SkeletonTextProps = {
  className?: string;
  lines?: number;
  lineHeight?: Dimension;
  gap?: Dimension;
  lastLineWidth?: Dimension;
};

export function SkeletonText({
  className,
  lines = 3,
  lineHeight = 12,
  gap = 8,
  lastLineWidth = '72%',
}: SkeletonTextProps) {
  return (
    <div aria-hidden="true" className={joinClassNames('skeleton-text', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonBlock
          key={`line-${index}`}
          height={lineHeight}
          width={index === lines - 1 ? lastLineWidth : '100%'}
          mt={index === 0 ? undefined : gap}
        />
      ))}
    </div>
  );
}

type SkeletonCardProps = {
  className?: string;
  children: ReactNode;
};

export function SkeletonCard({ className, children }: SkeletonCardProps) {
  return <div className={joinClassNames('card skeleton-card', className)}>{children}</div>;
}
