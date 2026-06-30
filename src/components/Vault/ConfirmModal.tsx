import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export function ConfirmModal({
  title,
  message,
  onConfirm,
  onCancel,
  confirmText,
  cancelText,
  isDestructive = true,
}: ConfirmModalProps) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full shrink-0 ${isDestructive ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}>
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{message}</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-950 p-4 flex gap-3 justify-end border-t border-white/5">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            {cancelText || t('common.cancel')}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onCancel(); // self-close logic usually handled by parent, but we can call onConfirm safely
            }}
            className={`px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors shadow-lg ${
              isDestructive ? 'bg-red-600 hover:bg-red-500 shadow-red-900/20' : 'bg-violet-600 hover:bg-violet-500 shadow-violet-900/20'
            }`}
          >
            {confirmText || t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
