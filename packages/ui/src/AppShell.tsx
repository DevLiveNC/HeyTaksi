import type { PropsWithChildren, ReactNode } from 'react';

interface AppShellProps extends PropsWithChildren {
  title: string;
  subtitle: string;
  navigation: ReactNode;
}

export function AppShell({ title, subtitle, navigation, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">HT</div>
        <div><strong>{title}</strong><small>{subtitle}</small></div>
      </header>
      <main className="app-content">{children}</main>
      <nav className="app-navigation" aria-label="Ana menü">{navigation}</nav>
    </div>
  );
}
