import type { ReactNode } from 'react';

export function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <section className="empty-state"><span className="empty-icon">{icon}</span><h2>{title}</h2><p>{description}</p></section>;
}
