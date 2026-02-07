import React from 'react';
import { Card, CardContent, CardHeader } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { useToast } from '../hooks/use-toast';
import { Building2, Plus, X, RotateCcw, Save, ShieldAlert } from 'lucide-react';
import { DepartmentCategoriesProvider, useDepartmentCategories } from '../hooks/use-department-categories';
import { useAuth } from '../hooks/use-auth';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetClose } from './ui/sheet';
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
  const [isEditingMobile, setIsEditingMobile] = React.useState(false);
  const { categories, isLoading, updateCategories } = useDepartmentCategories();

  React.useEffect(() => {
    const checkMobile = () => {
      setIsEditingMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
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
    <>
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
            {/* Desktop Edit Button */}
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "hidden md:flex h-7 px-2 text-[11px] font-medium border border-border/30",
                isEditing ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20" : "bg-muted/10 text-muted-foreground hover:bg-muted/20"
              )}
              onClick={() => setIsEditing(!isEditing)}
              disabled={isLoading}
            >
              {isEditing ? <Save className="h-3 w-3 mr-1" /> : null}
              {isEditing ? 'Done' : 'Edit'}
            </Button>
            {/* Mobile Edit Button (Opens Sheet) */}
            <Button
              variant="ghost"
              size="sm"
              className="flex md:hidden h-7 px-2 text-[11px] font-medium border border-border/30 bg-muted/10 text-muted-foreground"
              onClick={() => setIsEditing(true)}
              disabled={isLoading}
            >
              Edit
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground/70 mt-1 pl-9">
            {categories.length} categories • <span className="opacity-80">{isEditing && !isEditingMobile ? 'Manage list below' : 'Read-only view'}</span>
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-4 space-y-4">
          {/* Desktop Add new category (only when editing) */}
          <div className="hidden md:block">
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
          </div>

          {/* Categories list */}
          <div className="flex flex-wrap gap-1.5">
            {categories.map((category) => (
              <Badge
                key={category}
                variant="outline"
                className={cn(
                  "px-2 py-0 h-5 text-[11px] font-medium border-border/40 transition-all",
                  (isEditing && !isEditingMobile) ? "cursor-pointer hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 pr-1" : "bg-muted/20 text-muted-foreground/80"
                )}
                onClick={(isEditing && !isEditingMobile) ? () => removeCategory(category) : undefined}
              >
                {category}
                {(isEditing && !isEditingMobile) && <X className="h-2.5 w-2.5 ml-1 opacity-60" />}
              </Badge>
            ))}
            {categories.length === 0 && (
              <div className="w-full text-center py-4 border border-dashed border-border/20 rounded-lg">
                <p className="text-[11px] text-muted-foreground/60 italic">No categories defined</p>
              </div>
            )}
          </div>

          {/* Desktop Reset to defaults (only when editing) */}
          <div className="hidden md:block">
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
          </div>
        </CardContent>
      </Card>

      {/* Mobile Bottom Sheet for Editing */}
      <Sheet open={isEditing && isEditingMobile} onOpenChange={(open) => { if (!open) setIsEditing(false) }}>
        <SheetContent side="bottom" className="rounded-t-[2rem] p-6 pt-2 pb-10 focus:outline-none">
          {/* Handle bar */}
          <div className="flex justify-center mb-4">
            <div className="w-12 h-1.5 rounded-full bg-muted/40" />
          </div>

          <SheetHeader className="text-left space-y-1 mb-6">
            <SheetTitle className="text-lg font-bold tracking-tight">{department.name}</SheetTitle>
            <SheetDescription className="text-xs font-medium text-muted-foreground/70">
              Manage document categories and classification tags.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6">
            {/* Add Category */}
            <div className="space-y-2.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Add New Category</label>
              <div className="flex gap-2 p-1.5 rounded-2xl border border-border/10 bg-muted/5 shadow-inner">
                <Input
                  placeholder="Type category name..."
                  className="h-10 text-[13px] bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 px-3"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={isLoading}
                />
                <Button
                  onClick={addCategory}
                  disabled={!newCategory.trim() || isLoading}
                  size="sm"
                  className="h-10 w-10 p-0 shrink-0 rounded-xl shadow-lg active:scale-95 transition-transform"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Tags List */}
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1 flex justify-between items-center">
                Active Categories
                <span className="text-primary/60 font-mono text-[9px]">{categories.length}</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <Badge
                    key={category}
                    variant="outline"
                    className="pl-3 pr-2 py-1.5 h-auto text-[12px] font-semibold border-border/10 bg-background rounded-full transition-all active:bg-destructive/10 active:text-destructive active:border-destructive/30"
                    onClick={() => removeCategory(category)}
                  >
                    {category}
                    <X className="h-3 w-3 ml-2 opacity-40" />
                  </Badge>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-border/10">
              <Button
                variant="ghost"
                size="sm"
                onClick={resetToDefaults}
                disabled={isLoading}
                className="w-full h-11 text-[13px] font-bold text-muted-foreground/60 hover:text-foreground active:bg-muted/20 rounded-xl"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-2" />
                Reset {department.name} Defaults
              </Button>
            </div>
          </div>

          <SheetFooter className="mt-8">
            <SheetClose asChild>
              <Button className="w-full h-12 rounded-2xl font-bold text-[14px] shadow-xl active:scale-[0.98] transition-all">
                Done Editing
              </Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default function DepartmentCategoriesManagement({ departments }: DepartmentCategoriesManagementProps) {
  const { hasPermission } = useAuth();

  // Only show to admins
  if (!hasPermission('org.update_settings')) {
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
