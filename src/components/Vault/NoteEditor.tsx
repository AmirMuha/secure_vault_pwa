import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Save, Edit3, Type } from 'lucide-react';

interface NoteEditorProps {
  initialContent?: string;
  onSave: (title: string, content: string) => void;
  onClose: () => void;
}

export function NoteEditor({ initialContent = '', onSave, onClose }: NoteEditorProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState(initialContent);
  const [isMarkdown, setIsMarkdown] = useState(true);

  useEffect(() => {
    if (!initialContent) {
      setTitle(t('noteEditor.untitledNote'));
    }
  }, [initialContent, t]);

  const handleSave = () => {
    if (!title.trim() || !content.trim()) return;
    onSave(title.trim(), content);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="relative flex flex-col w-full max-w-4xl h-[85vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-slate-950/50">
          <div className="flex-1 pr-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('noteEditor.noteTitlePlaceholder')}
              className="w-full bg-transparent text-xl font-bold text-white placeholder-slate-500 focus:outline-none focus:border-b focus:border-violet-500 pb-1 transition-colors"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMarkdown(!isMarkdown)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isMarkdown ? 'bg-violet-600/20 text-violet-400' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {isMarkdown ? <Edit3 className="h-4 w-4" /> : <Type className="h-4 w-4" />}
              {isMarkdown ? t('noteEditor.markdown') : t('noteEditor.plainText')}
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || !content.trim()}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-violet-600 text-white font-medium text-sm hover:bg-violet-500 transition-colors disabled:opacity-50 shadow-lg shadow-violet-900/20"
            >
              <Save className="h-4 w-4" />
              {t('noteEditor.saveToVault')}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ml-2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Editor Body */}
        <div className="flex-1 flex flex-col bg-slate-950 relative">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('noteEditor.startTyping')}
            className="flex-1 w-full p-6 bg-transparent text-slate-200 resize-none focus:outline-none font-mono text-sm leading-relaxed"
            spellCheck="false"
          />
        </div>

      </div>
    </div>
  );
}
