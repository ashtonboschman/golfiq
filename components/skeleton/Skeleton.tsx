import type { CSSProperties, ReactNode } from 'react';

type Dimension = number | string;

function toStyleValue(value?: Dimension): string | undefined {
  if (value == null) return undefined;
  return typeof value === 'number' ? `${value}px` : value;
}

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

type SkeletonBlockProps = {
  className?: string;
  width?: Dimension;
  height?: Dimension;
  style?: CSSProperties;
};

export function SkeletonBlock({ className, width, height, style }: SkeletonBlockProps) {
  const inlineStyle: CSSProperties = {
    width: toStyleValue(width),
    height: toStyleValue(height),
    ...style,
  };

  return <div aria-hidden="true" className={joinClassNames('skeleton', className)} style={inlineStyle} />;
}

type SkeletonCircleProps = {
  className?: string;
  size?: Dimension;
  style?: CSSProperties;
};

export function SkeletonCircle({ className, size = 36, style }: SkeletonCircleProps) {
  return (
    <SkeletonBlock
      className={joinClassNames('skeleton-circle', className)}
      width={size}
      height={size}
      style={{ borderRadius: '999px', ...style }}
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
          style={{ marginTop: index === 0 ? 0 : toStyleValue(gap) }}
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
