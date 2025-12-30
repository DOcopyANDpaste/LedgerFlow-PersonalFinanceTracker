import React, { useState } from 'react';
import { Account, AccountType } from '../types';
import { ChevronRight, ChevronDown, Plus, Folder, Wallet, TrendingUp, TrendingDown, PiggyBank, Edit2, Check, X } from 'lucide-react';

interface AccountTreeProps {
  accounts: Account[];
  onAddAccount: (parentId: string, name: string, type: AccountType, budget: number) => void;
  onUpdateAccount: (accountId: string, newName: string, newBudget: number) => void;
}

const AccountNode: React.FC<{ 
  node: Account; 
  level: number;
  onAdd: (id: string, type: AccountType) => void 
}> = ({ node, level, onAdd }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Add Account State
  const [newName, setNewName] = useState('');
  const [newBudget, setNewBudget] = useState(0);

  // Edit State
  const [editNameVal, setEditNameVal] = useState(node.name);
  const [editBudgetVal, setEditBudgetVal] = useState(node.budget || 0);

  const hasChildren = node.children && node.children.length > 0;

  const getIcon = (type: AccountType) => {
    switch(type) {
        case AccountType.ASSET: return <Wallet className="w-4 h-4 text-blue-500" />;
        case AccountType.EXPENSE: return <TrendingDown className="w-4 h-4 text-red-500" />;
        case AccountType.INCOME: return <TrendingUp className="w-4 h-4 text-green-500" />;
        case AccountType.LIABILITY: return <Folder className="w-4 h-4 text-orange-500" />;
        default: return <PiggyBank className="w-4 h-4 text-purple-500" />;
    }
  }

  const handleSave = () => {
    (window as any).triggerUpdateAccount(node.id, editNameVal, Number(editBudgetVal));
    setIsEditing(false);
  };

  const startEditing = () => {
      setEditNameVal(node.name);
      setEditBudgetVal(node.budget || 0);
      setIsEditing(true);
  };

  return (
    <div className="select-none">
      <div 
        className={`flex items-center py-2 px-2 hover:bg-slate-50 rounded-md group`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className={`mr-1 p-1 rounded hover:bg-slate-200 ${!hasChildren ? 'opacity-0' : ''}`}
        >
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        
        <span className="mr-2 opacity-70">{getIcon(node.type)}</span>
        
        <div className="flex-1 flex items-center justify-between">
            {isEditing ? (
                <div className="flex items-center gap-2 flex-1 mr-2">
                    <input 
                      type="text" 
                      className="flex-1 min-w-[100px] border rounded px-1 py-0.5 text-xs text-slate-700 focus:outline-blue-500"
                      value={editNameVal}
                      onChange={(e) => setEditNameVal(e.target.value)}
                      autoFocus
                    />
                    {node.type === AccountType.EXPENSE && (
                       <input 
                          type="number" 
                          className="w-16 border rounded px-1 py-0.5 text-xs text-slate-700 focus:outline-blue-500"
                          value={editBudgetVal}
                          onChange={(e) => setEditBudgetVal(Number(e.target.value))}
                          placeholder="Budget"
                       />
                    )}
                    <button onClick={handleSave} className="text-green-600 hover:bg-green-100 p-0.5 rounded"><Check size={14}/></button>
                    <button onClick={() => setIsEditing(false)} className="text-red-500 hover:bg-red-100 p-0.5 rounded"><X size={14}/></button>
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-2 group/item">
                        <span className="font-medium text-slate-700 text-sm">{node.name}</span>
                        <button 
                            onClick={startEditing}
                            className="opacity-0 group-hover/item:opacity-100 group-hover:opacity-100 hover:text-blue-600 text-slate-400 p-1 transition-opacity"
                            title="Edit Account"
                        >
                            <Edit2 size={10} />
                        </button>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                        {node.type === AccountType.EXPENSE && node.budget && (
                           <span className="flex items-center gap-1">
                              <span>${node.budget}/mo</span>
                           </span>
                        )}
                        <button 
                            onClick={() => setShowAdd(!showAdd)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-100 text-blue-600 rounded transition-opacity"
                            title="Add Sub-account"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                </>
            )}
        </div>
      </div>

      {showAdd && (
         <div className="ml-8 p-3 bg-slate-50 border rounded-md my-1 shadow-inner">
             <div className="text-xs font-bold text-slate-500 mb-2">New Child Account for {node.name}</div>
             <div className="flex gap-2 mb-2">
                 <input 
                    type="text" 
                    placeholder="Account Name" 
                    className="border p-1 rounded text-sm flex-1"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                 />
                 <input 
                    type="number" 
                    placeholder="Budget ($)" 
                    className="border p-1 rounded text-sm w-24"
                    value={newBudget}
                    onChange={(e) => setNewBudget(Number(e.target.value))}
                 />
             </div>
             <div className="flex gap-2">
                 <button 
                    onClick={() => {
                        (window as any).triggerAddAccount(node.id, newName, node.type, newBudget);
                        setNewName('');
                        setNewBudget(0);
                        setShowAdd(false);
                        setIsOpen(true);
                    }}
                    className="bg-blue-600 text-white text-xs px-3 py-1 rounded"
                 >
                     Create
                 </button>
                 <button 
                    onClick={() => setShowAdd(false)}
                    className="text-slate-500 text-xs px-3 py-1"
                 >
                     Cancel
                 </button>
             </div>
         </div>
      )}

      {isOpen && node.children && (
        <div className="border-l border-slate-100 ml-4">
          {node.children.map(child => (
            <AccountNode 
                key={child.id} 
                node={child} 
                level={level + 1} 
                onAdd={onAdd}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const AccountTree: React.FC<AccountTreeProps> = ({ accounts, onAddAccount, onUpdateAccount }) => {
    // Expose the trigger to window for the deep nested component to access without prop drill hell in this specific simple demo structure
    React.useEffect(() => {
        (window as any).triggerAddAccount = onAddAccount;
        (window as any).triggerUpdateAccount = onUpdateAccount;
    }, [onAddAccount, onUpdateAccount]);

  return (
    <div className="h-full overflow-y-auto pr-2">
      {accounts.map(root => (
        <AccountNode key={root.id} node={root} level={0} onAdd={() => {}} />
      ))}
    </div>
  );
};