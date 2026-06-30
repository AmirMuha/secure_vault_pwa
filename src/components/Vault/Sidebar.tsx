import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, FolderPlus, Grid, List as ListIcon, Trash2 } from 'lucide-react';
import { type EncryptedCategory } from '../../lib/db';

interface SidebarProps {
  categories: { meta: EncryptedCategory; name: string }[];
  activeCategoryId: string | 'all';
  onSelectCategory: (id: string | 'all') => void;
  onCreateCategory: (name: string) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({
  categories,
  activeCategoryId,
  onSelectCategory,
  onCreateCategory,
  onDeleteCategory,
  viewMode,
  onViewModeChange,
  isOpen,
  onClose
}: SidebarProps) {
  const { t } = useTranslation();
  const [isCreating, setIsCreating] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    await onCreateCategory(newCatName.trim());
    setNewCatName('');
    setIsCreating(false);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 lg:hidden" 
          onClick={onClose}
        />
      )}

      <div className={`w-64 bg-slate-900 border-e border-white/5 flex flex-col h-full fixed lg:static inset-y-0 start-0 z-50 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'} lg:translate-x-0 rtl:lg:translate-x-0 shadow-2xl lg:shadow-none`}>
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">{t('sidebar.library')}</h2>
        <div className="flex bg-slate-950 p-1 rounded-lg border border-white/5">
          <button
            onClick={() => onViewModeChange('grid')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Grid className="h-4 w-4" />
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <ListIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        <button
          onClick={() => onSelectCategory('all')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${activeCategoryId === 'all' ? 'bg-violet-600/10 text-violet-400 font-medium' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800">
            <Folder className="h-4 w-4" />
          </div>
          {t('sidebar.allFiles')}
        </button>

        <div className="pt-6 pb-2">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-3 flex items-center justify-between">
            {t('sidebar.folders')}
            <button
              onClick={() => setIsCreating(!isCreating)}
              className="p-1 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          </h2>
        </div>

        {isCreating && (
          <form onSubmit={handleCreate} className="px-2 mb-2">
            <input
              autoFocus
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onBlur={() => setIsCreating(false)}
              placeholder={t('sidebar.newFolderPlaceholder')}
              className="w-full bg-slate-950 border border-violet-500/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            />
          </form>
        )}

        {categories.map((cat) => (
          <div key={cat.meta.id} className="group flex items-center relative">
            <button
              onClick={() => onSelectCategory(cat.meta.id)}
              className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${activeCategoryId === cat.meta.id ? 'bg-violet-600/10 text-violet-400 font-medium' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${activeCategoryId === cat.meta.id ? 'bg-violet-500/20 text-violet-400' : 'bg-slate-800 group-hover:bg-slate-700'}`}>
                <Folder className="h-4 w-4" />
              </div>
              <span className="truncate">{cat.name}</span>
            </button>
            <button
              onClick={() => onDeleteCategory(cat.meta.id)}
              className="absolute end-2 p-1.5 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all rounded-lg hover:bg-red-400/10"
              title={t('sidebar.deleteEmpty')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      </div>
    </>
  );
}
