import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { dashboardApi } from '../api/client';
import { KnowledgeCategory } from '../types';
import MDEditor from '@uiw/react-md-editor';
import rehypeSanitize from 'rehype-sanitize';
import { ArrowLeft, Save } from 'lucide-react';

export const KnowledgeEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string>(searchParams.get('categoryId') || '');
  const [content, setContent] = useState<string>('');
  
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const cats = await dashboardApi.get<KnowledgeCategory[]>('/knowledge/categories');
        setCategories(cats);
      } catch (err: any) {
        setError(err.message);
      }
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    if (id) {
      const fetchArticle = async () => {
        try {
          const doc = await dashboardApi.get<any>(`/knowledge/articles/${id}`);
          const articleContent = await dashboardApi.get<any>(`/knowledge/articles/${id}/content`);
          
          setTitle(doc.title);
          setCategoryId(doc.category_id || '');
          // Content might be plain text string from the endpoint, depending on how API is built
          setContent(articleContent.content || articleContent || '');
        } catch (err: any) {
          setError(err.message);
        }
      };
      fetchArticle();
    }
  }, [id]);

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    
    setIsSaving(true);
    setError(null);
    try {
      if (id) {
        await dashboardApi.put(`/knowledge/articles/${id}`, {
          title,
          category_id: categoryId || null,
          content
        });
      } else {
        await dashboardApi.post('/knowledge/articles', {
          title,
          category_id: categoryId || null,
          content
        });
      }
      navigate('/knowledge');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const renderCategoryOptions = (cats: KnowledgeCategory[], parentId: string | null = null, depth = 0): React.ReactNode[] => {
    const children = cats.filter(c => c.parent_id === parentId);
    let options: React.ReactNode[] = [];
    
    for (const child of children) {
      const prefix = '\u00A0\u00A0'.repeat(depth * 2);
      options.push(
        <option key={child.id} value={child.id}>
          {prefix}{child.name}
        </option>
      );
      options = options.concat(renderCategoryOptions(cats, child.id, depth + 1));
    }
    return options;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex-none px-6 py-4 bg-white border-b border-gray-200 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => navigate('/knowledge')}
            className="text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-gray-900">
            {id ? 'Edit Article' : 'New Article'}
          </h1>
        </div>
        
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSaving ? (
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <Save size={16} className="mr-2" />
          )}
          {isSaving ? 'Saving...' : 'Save Article'}
        </button>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-md">
              {error}
            </div>
          )}

          <div className="bg-white shadow rounded-lg p-6 border border-gray-200 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  placeholder="e.g., How to reset your password"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                >
                  <option value="">No Category (Root)</option>
                  {renderCategoryOptions(categories)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Content (Markdown)</label>
              <div data-color-mode="light">
                <MDEditor
                  value={content}
                  onChange={val => setContent(val || '')}
                  height={500}
                  preview="edit"
                  className="w-full"
                  previewOptions={{
                    rehypePlugins: [[rehypeSanitize]]
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
