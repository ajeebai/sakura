
import React, { useState, useEffect } from 'react';
import { Playlist } from '../types';
import { X, Plus, FolderHeart, Music } from 'lucide-react';

interface CurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlists: Playlist[];
  onAddToCuration: (playlistId: string | null, newName?: string) => void;
}

export const CurationModal: React.FC<CurationModalProps> = ({ 
    isOpen, onClose, playlists, onAddToCuration 
}) => {
  const [newCurationName, setNewCurationName] = useState('');
  const [view, setView] = useState<'list' | 'new'>('list');

  useEffect(() => {
      if (isOpen) {
          setView(playlists.length === 0 ? 'new' : 'list');
          setNewCurationName('');
      }
  }, [isOpen, playlists]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="glass-panel w-full max-w-md rounded-2xl shadow-[var(--shadow-zen)] overflow-hidden flex flex-col max-h-[80vh] border-0">
        
        {/* Header */}
        <div className="p-5 border-b border-[var(--border-glass)] flex items-center justify-between">
            <h3 className="text-xl text-[var(--text-main)] font-semibold flex items-center gap-2">
                <FolderHeart className="w-5 h-5 text-[var(--accent)]" strokeWidth={1} />
                Add to Curation
            </h3>
            <button onClick={onClose} className="p-1 hover:bg-[var(--bg-overlay)] rounded-full text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
                <X className="w-5 h-5" strokeWidth={1} />
            </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 bg-transparent">
            {view === 'list' ? (
                <div className="space-y-2">
                    {playlists.map(pl => (
                        <button
                            key={pl.id}
                            onClick={() => onAddToCuration(pl.id)}
                            className="w-full flex items-center justify-between p-4 rounded-xl border border-[var(--border-glass)] hover:border-[var(--accent)] hover:bg-[var(--bg-card)] transition-all group text-left"
                        >
                            <span className="text-[var(--text-main)] text-lg font-medium">{pl.name}</span>
                            <span className="mono text-xs text-[var(--text-muted)] group-hover:text-[var(--text-main)]">
                                {pl.bookIds.length} items
                            </span>
                        </button>
                    ))}
                    
                    <button
                        onClick={() => setView('new')}
                        className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-[var(--border-glass)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--text-main)] transition-all mt-4 group"
                    >
                        <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" strokeWidth={1} />
                        <span className="mono text-xs uppercase tracking-widest">Create New Curation</span>
                    </button>
                </div>
            ) : (
                <div className="space-y-6 pt-2">
                    <div className="space-y-3">
                        <label className="mono text-xs uppercase tracking-widest text-[var(--text-muted)]">Curation Name</label>
                        <input 
                            type="text" 
                            autoFocus
                            placeholder="e.g. Weekend Reads, Best Art..."
                            value={newCurationName}
                            onChange={(e) => setNewCurationName(e.target.value)}
                            className="w-full bg-[var(--bg-card)] border border-[var(--border-glass)] p-4 rounded-xl text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all placeholder:text-[var(--text-muted)]/50"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && newCurationName.trim()) {
                                    onAddToCuration(null, newCurationName);
                                }
                            }}
                        />
                    </div>
                    <div className="flex gap-3">
                        {playlists.length > 0 && (
                            <button 
                                onClick={() => setView('list')}
                                className="flex-1 py-3 rounded-xl border border-[var(--border-glass)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-all"
                            >
                                Cancel
                            </button>
                        )}
                        <button 
                            disabled={!newCurationName.trim()}
                            onClick={() => onAddToCuration(null, newCurationName)}
                            className="flex-1 py-3 rounded-xl bg-[var(--text-main)] text-[var(--bg-main)] font-medium disabled:opacity-50 hover:opacity-90 transition-opacity shadow-lg"
                        >
                            Create
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
