import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ isOpen, title = "Confirm Action", message, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-[100] bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full border border-slate-200 p-6 animate-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-4">
            <div className="bg-red-100 p-2 rounded-full shrink-0">
                <AlertTriangle size={24} className="text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">{title}</h3>
        </div>
        
        <p className="text-slate-600 mb-6 text-sm leading-relaxed">
            {message}
        </p>

        <div className="flex justify-end gap-3">
            <button 
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
            >
                Cancel
            </button>
            <button 
                onClick={onConfirm}
                className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-md shadow-sm transition-colors"
            >
                Delete
            </button>
        </div>
      </div>
    </div>
  );
};