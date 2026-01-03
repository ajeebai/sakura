import React, { useState, useEffect } from 'react';
import { Book } from '../types';
import { X, Heart, EyeOff, Save, Tag } from 'lucide-react';

interface EditBookModalProps {
  book: Book;
  isOpen: boolean;
  onClose: () => void;
  onSave: (bookId: string, changes: { tags: string[]; isFavorite: boolean; isHidden: boolean }) => void;
}

export const EditBookModal: React.FC<EditBookModalProps> = ({ book, isOpen, onClose, onSave }) => {
  const [tags, setTags] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    if (isOpen && book) {
      setTags((book.tags || []).join(', '));
      setIsFavorite(!!book.isFavorite);
      setIsHidden(!!book.isHidden);
    }
  }, [isOpen, book]);

  if (!isOpen) return null;

  const handleSave = () => {
    const cleanTags = tags
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);
    
    // Remove duplicates
    const uniqueTags = [...new Set(cleanTags)];

    onSave(book.id, {
      tags: uniqueTags,
      isFavorite,
      isHidden
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50">
          <h3 className="font-serif font-bold text-lg text-stone-800">Edit Details</h3>
          <button onClick={onClose} className="p-1 hover:bg-stone-200 rounded-full transition-colors text-stone-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          
          {/* Title (Read Only) */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Title</label>
            <p className="text-stone-800 font-medium truncate bg-stone-50 p-3 rounded-lg border border-stone-100">
              {book.title}
            </p>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-400 flex items-center gap-2">
              <Tag className="w-3 h-3" />
              Tags
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="manga, sci-fi, read-later..."
              className="w-full bg-white border border-stone-200 rounded-lg p-3 text-stone-700 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 transition-all placeholder:text-stone-300"
            />
            <p className="text-[10px] text-stone-400">Separate tags with commas</p>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-4">
            {/* Favorite */}
            <button
              onClick={() => setIsFavorite(!isFavorite)}
              className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border transition-all ${
                isFavorite 
                  ? 'bg-rose-50 border-rose-200 text-rose-600' 
                  : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
              }`}
            >
              <Heart className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} />
              <span className="font-medium text-sm">Favorite</span>
            </button>

            {/* Hidden */}
            <button
              onClick={() => setIsHidden(!isHidden)}
              className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border transition-all ${
                isHidden 
                  ? 'bg-stone-800 border-stone-800 text-white' 
                  : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
              }`}
            >
              <EyeOff className="w-5 h-5" />
              <span className="font-medium text-sm">Hidden</span>
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-stone-500 hover:text-stone-800 hover:bg-stone-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="px-6 py-2 text-sm font-bold text-white bg-stone-900 hover:bg-rose-600 rounded-lg shadow-lg shadow-stone-200 hover:shadow-rose-200 transition-all flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>

      </div>
    </div>
  );
};
