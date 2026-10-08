import type { ReactNode } from 'react';
import './LoadingMotion.css';

export type LoadingMotionProps = {
  kind: 'rotate' | 'pulse';
  active: boolean;
  children: ReactNode;
};

export function LoadingMotion({ kind, active, children }: LoadingMotionProps) {
  return <div className="feed-loading-motion" data-loading-motion={kind} data-active={active}>
    {children}
  </div>;
}
