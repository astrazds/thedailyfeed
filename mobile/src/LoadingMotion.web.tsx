import type { LoadingMotionProps } from './LoadingMotion';
import './LoadingMotion.css';

export function LoadingMotion({ kind, active, children }: LoadingMotionProps) {
  return <div className="feed-loading-motion" data-loading-motion={kind} data-active={active}>
    {children}
  </div>;
}
