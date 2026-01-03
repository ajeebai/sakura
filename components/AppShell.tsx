import React from 'react';
import { Library, Theme } from '../types';

interface AppShellProps {
  children: React.ReactNode;
  libraries: Library[];
  activeLibraryId: string | null;
  onSelectLibrary: (library: Library) => void;
  onGoHome: () => void;
  currentTheme: Theme;
  onToggleTheme: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  children
}) => {
  return (
    <div className="flex h-screen w-full bg-[var(--bg-main)] overflow-hidden text-[var(--text-main)] font-sans">
      {/* Main Content Area - No Sidebar */}
      <main className="flex-1 overflow-hidden relative flex flex-col bg-[var(--bg-main)]">
        {children}
      </main>
    </div>
  );
};