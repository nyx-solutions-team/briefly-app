"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';

export function MetadataSettings() {
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<any>(null);
  const [formData, setFormData] = useState({
    field_name: '',
    field_type: 'text',
    is_searchable: true,
    is_embedded: true,
    weight: 1.0
  });
  
  const { toast } = useToast();

  useEffect(() => {
    fetchMetadataFields();
  }, []);

  const fetchMetadataFields = async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/metadata-config');
      setFields(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch metadata fields",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddField = async () => {
    try {
      const newField = await apiFetch('/metadata-config', {
        method: 'POST',
        body: formData
      });
      
      setFields([...fields, newField]);
      resetForm();
      setIsDialogOpen(false);
      
      toast({
        title: "Success",
        description: "Metadata field added successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add metadata field",
        variant: "destructive"
      });
    }
  };

  const handleUpdateField = async () => {
    try {
      const updatedField = await apiFetch(`/metadata-config/${editingField?.id}`, {
        method: 'PATCH',
        body: formData
      });
      
      setFields(fields.map(f => f.id === editingField?.id ? updatedField : f));
      resetForm();
      setEditingField(null);
      setIsDialogOpen(false);
      
      toast({
        title: "Success",
        description: "Metadata field updated successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update metadata field",
        variant: "destructive"
      });
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    try {
      await apiFetch(`/metadata-config/${fieldId}`, {
        method: 'DELETE'
      });
      
      setFields(fields.filter(f => f.id !== fieldId));
      
      toast({
        title: "Success",
        description: "Metadata field deleted successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete metadata field",
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setFormData({
      field_name: '',
      field_type: 'text',
      is_searchable: true,
      is_embedded: true,
      weight: 1.0
    });
  };

  const openAddDialog = () => {
    resetForm();
    setEditingField(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (field: any) => {
    setFormData({
      field_name: field.field_name,
      field_type: field.field_type,
      is_searchable: field.is_searchable,
      is_embedded: field.is_embedded,
      weight: field.weight
    });
    setEditingField(field);
    setIsDialogOpen(true);
  };

  if (loading) {
    return <div>Loading metadata configuration...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Metadata Configuration</h3>
          <p className="text-sm text-muted-foreground">
            Configure custom metadata fields for your documents
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAddDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Field
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingField ? 'Edit Metadata Field' : 'Add Metadata Field'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="field_name">Field Name</Label>
                <Input
                  id="field_name"
                  value={formData.field_name}
                  onChange={(e) => setFormData({...formData, field_name: e.target.value})}
                  placeholder="e.g., project_code, contract_type"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="field_type">Field Type</Label>
                <Select 
                  value={formData.field_type} 
                  onValueChange={(value) => setFormData({...formData, field_type: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="category">Category</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="array">Array</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="is_searchable">Searchable</Label>
                <Switch
                  id="is_searchable"
                  checked={formData.is_searchable}
                  onCheckedChange={(checked) => setFormData({...formData, is_searchable: checked})}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="is_embedded">Embed for Semantic Search</Label>
                <Switch
                  id="is_embedded"
                  checked={formData.is_embedded}
                  onCheckedChange={(checked) => setFormData({...formData, is_embedded: checked})}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="weight">Search Weight (0.0 - 1.0)</Label>
                <Input
                  id="weight"
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={formData.weight}
                  onChange={(e) => setFormData({...formData, weight: parseFloat(e.target.value) || 0})}
                />
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={editingField ? handleUpdateField : handleAddField}>
                  {editingField ? 'Update' : 'Add'} Field
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Configured Metadata Fields</CardTitle>
          <CardDescription>
            Manage custom metadata fields for enhanced document search and organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No custom metadata fields configured yet.</p>
              <p className="text-sm mt-2">Add your first field to enhance document search capabilities.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {fields.map((field) => (
                <div key={field.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <div className="font-medium">{field.field_name}</div>
                    <div className="text-sm text-muted-foreground">
                      Type: {field.field_type} • 
                      Searchable: {field.is_searchable ? 'Yes' : 'No'} • 
                      Embedded: {field.is_embedded ? 'Yes' : 'No'} • 
                      Weight: {field.weight}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(field)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteField(field.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}