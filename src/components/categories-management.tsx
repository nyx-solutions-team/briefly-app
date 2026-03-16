"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Tag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch, getApiContext } from '@/lib/api';

interface CategoriesManagementProps {
  categories: string[];
  onCategoriesChange: (categories: string[]) => void;
}

export default function CategoriesManagement({ categories, onCategoriesChange }: CategoriesManagementProps) {
  const [newCategory, setNewCategory] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const { toast } = useToast();

  const addCategory = async () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    
    if (categories.includes(trimmed)) {
      toast({
        title: 'Category already exists',
        description: `"${trimmed}" is already in your categories list.`,
        variant: 'destructive' as any,
      });
      return;
    }

    const updatedCategories = [...categories, trimmed];
    await updateCategories(updatedCategories);
    setNewCategory('');
  };

  const removeCategory = async (categoryToRemove: string) => {
    const updatedCategories = categories.filter(cat => cat !== categoryToRemove);
    await updateCategories(updatedCategories);
  };

  const updateCategories = async (newCategories: string[]) => {
    setIsLoading(true);
    try {
      const orgId = getApiContext().orgId || '';
      if (!orgId) {
        throw new Error('No organization selected');
      }

      await apiFetch(`/orgs/${orgId}/settings`, {
        method: 'PUT',
        body: { categories: newCategories },
      });

      onCategoriesChange(newCategories);
      
      toast({
        title: 'Categories updated',
        description: 'Your document categories have been updated successfully.',
      });
    } catch (error: any) {
      toast({
        title: 'Error updating categories',
        description: error.message || 'Failed to update categories. Please try again.',
        variant: 'destructive' as any,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCategory();
    }
  };

  const resetToDefaults = async () => {
    const defaultCategories = [
      'General', 'Legal', 'Financial', 'HR', 'Marketing', 
      'Technical', 'Invoice', 'Contract', 'Report', 'Correspondence'
    ];
    await updateCategories(defaultCategories);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          Document Categories
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Manage the categories available for document classification. These will appear in dropdown menus when creating or editing documents.
        </p>
        
        {/* Add new category */}
        <div className="flex gap-2">
          <Input
            placeholder="Enter new category name..."
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
          />
          <Button 
            onClick={addCategory} 
            disabled={!newCategory.trim() || isLoading}
            size="sm"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Categories list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Current Categories ({categories.length})</h4>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={resetToDefaults}
              disabled={isLoading}
            >
              Reset to Defaults
            </Button>
          </div>
          
          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
            {categories.map((category) => (
              <Badge key={category} variant="secondary" className="flex items-center gap-1 py-1 px-2">
                <span>{category}</span>
                <button
                  onClick={() => removeCategory(category)}
                  disabled={isLoading}
                  className="ml-1 hover:text-destructive transition-colors"
                  title={`Remove ${category}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          
          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              No categories defined. Add some categories to organize your documents.
            </p>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          <strong>Tip:</strong> Categories help organize and filter documents. Consider creating categories that match your workflow (e.g., by department, document type, or project).
        </div>
      </CardContent>
    </Card>
  );
}