import type { ReactNode } from 'react';

export type LoadingMotionProps = {
  kind: 'rotate' | 'pulse';
  active: boolean;
  children: ReactNode;
};

export function LoadingMotion({ children }: LoadingMotionProps) {
  return <>{children}</>;
}
