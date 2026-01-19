import React from 'react';
import { Card, CardContent, CardHeader } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { useToast } from '../hooks/use-toast';
import { Building2, Plus, X, RotateCcw, Save, ShieldAlert } from 'lucide-react';
import { DepartmentCategoriesProvider, useDepartmentCategories } from '../hooks/use-department-categories';
import { useAuth } from '../hooks/use-auth';
import { cn } from '@/lib/utils';

interface Department {
  id: string;
  name: string;
  categories?: string[];
}

interface DepartmentCategoriesManagementProps {
  departments: Department[];
}

function CategoryManager({ department }: { department: Department }) {
  const [newCategory, setNewCategory] = React.useState('');
  const [isEditing, setIsEditing] = React.useState(false);
  const { categories, isLoading, updateCategories } = useDepartmentCategories();
  const { toast } = useToast();

  const addCategory = async () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;

    if (categories.includes(trimmed)) {
      toast({
        title: 'Category already exists',
        description: `"${trimmed}" is already in this department's categories.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      const updatedCategories = [...categories, trimmed];
      await updateCategories(updatedCategories);
      setNewCategory('');
      toast({
        title: 'Category added',
        description: `"${trimmed}" has been added to ${department.name}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error adding category',
        description: error.message || 'Failed to add category. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const removeCategory = async (categoryToRemove: string) => {
    try {
      const updatedCategories = categories.filter(cat => cat !== categoryToRemove);
      await updateCategories(updatedCategories);
      toast({
        title: 'Category removed',
        description: `"${categoryToRemove}" has been removed from ${department.name}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error removing category',
        description: error.message || 'Failed to remove category. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const resetToDefaults = async () => {
    const defaultCategories = ['General', 'Legal', 'Financial', 'HR', 'Marketing', 'Technical', 'Invoice', 'Contract', 'Report', 'Correspondence'];
    try {
      await updateCategories(defaultCategories);
      toast({
        title: 'Categories reset',
        description: `${department.name} categories have been reset to defaults.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error resetting categories',
        description: error.message || 'Failed to reset categories. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCategory();
    }
  };

  return (
    <Card className="h-fit border-border/40 bg-card/40 shadow-sm transition-all hover:bg-card/60">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/30">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground/70" />
            </div>
            <h3 className="text-[14px] font-semibold text-foreground truncate leading-tight tracking-tight">
              {department.name}
            </h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 px-2 text-[11px] font-medium border border-border/30",
              isEditing ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20" : "bg-muted/10 text-muted-foreground hover:bg-muted/20"
            )}
            onClick={() => setIsEditing(!isEditing)}
            disabled={isLoading}
          >
            {isEditing ? <Save className="h-3 w-3 mr-1" /> : null}
            {isEditing ? 'Done' : 'Edit'}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground/70 mt-1 pl-9">
          {categories.length} categories • <span className="opacity-80">{isEditing ? 'Manage list below' : 'Read-only view'}</span>
        </p>
      </CardHeader>
      <CardContent className="p-4 pt-4 space-y-4">
        {/* Add new category (only when editing) */}
        {isEditing && (
          <div className="flex gap-1.5 p-1.5 rounded-lg border border-border/20 bg-background/30 shadow-inner">
            <Input
              placeholder="category name..."
              className="h-7 text-[12px] bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 px-1"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
            />
            <Button
              onClick={addCategory}
              disabled={!newCategory.trim() || isLoading}
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Categories list */}
        <div className="flex flex-wrap gap-1.5">
          {categories.map((category) => (
            <Badge
              key={category}
              variant="outline"
              className={cn(
                "px-2 py-0 h-5 text-[11px] font-medium border-border/40 transition-all",
                isEditing ? "cursor-pointer hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 pr-1" : "bg-muted/20 text-muted-foreground/80"
              )}
              onClick={isEditing ? () => removeCategory(category) : undefined}
            >
              {category}
              {isEditing && <X className="h-2.5 w-2.5 ml-1 opacity-60" />}
            </Badge>
          ))}
          {categories.length === 0 && (
            <div className="w-full text-center py-4 border border-dashed border-border/20 rounded-lg">
              <p className="text-[11px] text-muted-foreground/60 italic">No categories defined</p>
            </div>
          )}
        </div>

        {/* Reset to defaults (only when editing) */}
        {isEditing && (
          <div className="pt-2 border-t border-border/20">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetToDefaults}
              disabled={isLoading}
              className="w-full h-7 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/20"
            >
              <RotateCcw className="h-3 w-3 mr-1.5" />
              Reset to Defaults
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DepartmentCategoriesManagement({ departments }: DepartmentCategoriesManagementProps) {
  const { user } = useAuth();

  // Only show to admins
  if (user?.role !== 'systemAdmin') {
    return (
      <div className="p-8 text-center flex flex-col items-center justify-center min-h-[200px]">
        <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-destructive/10 text-destructive mb-3">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <h3 className="text-[14px] font-semibold text-foreground tracking-tight">Access Restricted</h3>
        <p className="text-[12px] text-muted-foreground mt-1 max-w-[240px]">
          Only administrators can manage department categories and classification rules.
        </p>
      </div>
    );
  }

  if (departments.length === 0) {
    return (
      <div className="p-12 text-center border border-dashed border-border/30 rounded-xl bg-muted/5">
        <Building2 className="h-10 w-10 mx-auto mb-4 opacity-20" />
        <h3 className="text-[14px] font-semibold text-foreground">No Departments Found</h3>
        <p className="text-[12px] text-muted-foreground mt-1 max-w-[280px] mx-auto">
          You need to create departments in the Teams settings before you can manage their document categories.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
        {departments.map((department) => (
          <DepartmentCategoriesProvider key={department.id} departmentId={department.id}>
            <CategoryManager department={department} />
          </DepartmentCategoriesProvider>
        ))}
      </div>
    </div>
  );
}

