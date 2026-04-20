import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../api/client';
import { KnowledgeCategory, KnowledgeDoc } from '../types';
import { Plus, Folder, FileText, Trash2, ChevronRight, ChevronDown } from 'lucide-react';

interface CategoryNode extends KnowledgeCategory {
  children: CategoryNode[];
}

export const KnowledgePage: React.FC = () => {
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState<{ parentId: string | null } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    type: 'category' | 'document' | null;
    id: string | null;
    title: string;
  }>({ isOpen: false, type: null, id: null, title: '' });

  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      const [cats, articles] = await Promise.all([
        dashboardApi.get<KnowledgeCategory[]>('/knowledge/categories'),
        dashboardApi.get<KnowledgeDoc[]>('/knowledge/articles')
      ]);
      
      const categoryMap = new Map<string, CategoryNode>();
      const roots: CategoryNode[] = [];
      
      cats.forEach(c => {
        categoryMap.set(c.id, { ...c, children: [] });
      });

      cats.forEach(c => {
        const node = categoryMap.get(c.id)!;
        if (c.parent_id && categoryMap.has(c.parent_id)) {
          categoryMap.get(c.parent_id)!.children.push(node);
        } else {
          roots.push(node);
        }
      });
      
      setCategories(roots);
      setDocs(articles);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddCategory = async (parentId: string | null) => {
    if (!newCategoryName.trim()) {
      setIsAddingCategory(null);
      return;
    }
    try {
      await dashboardApi.post('/knowledge/categories', {
        name: newCategoryName,
        parent_id: parentId
      });
      setNewCategoryName('');
      setIsAddingCategory(null);
      if (parentId) {
        setExpandedCategories(prev => new Set(prev).add(parentId));
      }
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const confirmDeleteCategory = (id: string, name: string) => {
    setDeleteConfirm({
      isOpen: true,
      type: 'category',
      id,
      title: `Are you sure you want to delete the category "${name}"?`
    });
  };

  const confirmDeleteDoc = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm({
      isOpen: true,
      type: 'document',
      id,
      title: `Are you sure you want to delete the document "${title}"?`
    });
  };

  const executeDelete = async () => {
    if (!deleteConfirm.id || !deleteConfirm.type) return;
    try {
      if (deleteConfirm.type === 'category') {
        await dashboardApi.delete(`/knowledge/categories/${deleteConfirm.id}`);
        if (selectedCategoryId === deleteConfirm.id) {
          setSelectedCategoryId(null);
        }
      } else {
        await dashboardApi.delete(`/knowledge/articles/${deleteConfirm.id}`);
      }
      setDeleteConfirm({ isOpen: false, type: null, id: null, title: '' });
      fetchData();
    } catch (err: any) {
      setError(err.message);
      setDeleteConfirm({ isOpen: false, type: null, id: null, title: '' });
    }
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expandedCategories);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedCategories(next);
  };

  const renderCategoryNode = (node: CategoryNode, depth = 0) => {
    const isExpanded = expandedCategories.has(node.id);
    const isSelected = selectedCategoryId === node.id;
    
    return (
      <div key={node.id} className="w-full">
        <div 
          className={`flex items-center justify-between py-1.5 px-2 rounded-md cursor-pointer group ${
            isSelected ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-100 text-gray-700'
          }`}
          style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}
          onClick={() => setSelectedCategoryId(node.id)}
        >
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            {node.children.length > 0 ? (
              <button 
                onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
                className="p-0.5 hover:bg-gray-200 rounded text-gray-400"
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="w-[18px]"></span>
            )}
            <Folder size={14} className={isSelected ? 'text-indigo-500' : 'text-gray-400'} />
            <span className="truncate text-sm">{node.name}</span>
          </div>
          <div className="hidden group-hover:flex items-center space-x-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsAddingCategory({ parentId: node.id });
                setExpandedCategories(prev => new Set(prev).add(node.id));
              }}
              className="p-1 hover:bg-gray-200 rounded text-gray-500"
              title="Add Subcategory"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                confirmDeleteCategory(node.id, node.name);
              }}
              className="p-1 hover:bg-red-100 rounded text-red-500"
              title="Delete Category"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        
        {isExpanded && node.children.length > 0 && (
          <div className="mt-1">
            {node.children.map(child => renderCategoryNode(child, depth + 1))}
          </div>
        )}
        
        {isAddingCategory?.parentId === node.id && (
          <div 
            className="flex items-center py-1.5 px-2 mt-1"
            style={{ paddingLeft: `${(depth + 1) * 1.5 + 0.5}rem` }}
          >
            <input
              autoFocus
              type="text"
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddCategory(node.id);
                if (e.key === 'Escape') setIsAddingCategory(null);
              }}
              onBlur={() => handleAddCategory(node.id)}
              className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-1 px-2 w-full"
              placeholder="New category..."
            />
          </div>
        )}
      </div>
    );
  };

  const filteredDocs = docs.filter(doc => 
    selectedCategoryId === null || doc.category_id === selectedCategoryId
  );

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-gray-50">
      <div className="flex-none px-6 py-4 bg-white border-b border-gray-200 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
        <button
          onClick={() => navigate('/knowledge/new' + (selectedCategoryId ? `?categoryId=${selectedCategoryId}` : ''))}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus size={16} className="mr-2" />
          New Article
        </button>
      </div>

      {error && (
        <div className="m-4 bg-red-50 text-red-700 p-4 rounded-md flex-none">
          {error}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-72 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Categories</h2>
            <button
              onClick={() => setIsAddingCategory({ parentId: null })}
              className="p-1 hover:bg-gray-100 rounded-md text-gray-500"
              title="Add Root Category"
            >
              <Plus size={16} />
            </button>
          </div>
          
          <div className="p-2">
            <div 
              className={`flex items-center py-1.5 px-2 rounded-md cursor-pointer mb-2 ${
                selectedCategoryId === null ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-100 text-gray-700'
              }`}
              onClick={() => setSelectedCategoryId(null)}
            >
              <FileText size={16} className="mr-2 text-gray-400" />
              <span className="text-sm font-medium">All Articles</span>
            </div>
            
            <div className="space-y-1">
              {categories.map(root => renderCategoryNode(root))}
              
              {isAddingCategory?.parentId === null && (
                <div className="flex items-center py-1.5 px-2 pl-6 mt-1">
                  <input
                    autoFocus
                    type="text"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddCategory(null);
                      if (e.key === 'Escape') setIsAddingCategory(null);
                    }}
                    onBlur={() => handleAddCategory(null)}
                    className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-1 px-2 w-full"
                    placeholder="New category..."
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredDocs.map((doc) => (
                  <tr 
                    key={doc.id} 
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/knowledge/edit/${doc.id}`)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">{doc.title}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        doc.status === 'active' ? 'bg-green-100 text-green-800' : 
                        doc.status === 'processing' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={(e) => confirmDeleteDoc(doc.id, doc.title, e)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredDocs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-500">
                      No articles found in this category.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Confirm Deletion</h3>
            <p className="text-sm text-gray-500 mb-6">{deleteConfirm.title}</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirm({ isOpen: false, type: null, id: null, title: '' })}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
