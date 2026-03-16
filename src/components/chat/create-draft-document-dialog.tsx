'use client';

import React from 'react';
import { AlertCircle, FilePlus2, Loader2, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  getDocumentTypeSchema,
  listDocumentTypes,
  type DocumentTypeListItem,
  type MetadataSchemaField,
} from '@/lib/document-types-api';
import {
  buildDraftDocumentContent,
  buildDraftDocumentTitle,
  type TipTapDocument,
} from '@/lib/document-draft-builder';
import { extractTextFromTiptap } from '@/lib/tiptap-text';

export type GeneratedDraftPayload = {
  title: string;
  content: TipTapDocument;
  contentText: string;
  generatedAtIso: string;
  documentTypeName: string;
  documentTypeId: string;
  documentTypeKey?: string;
  specialInstructions?: string;
  answers: Record<string, string>;
};

type CreateDraftDocumentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated?: (payload: GeneratedDraftPayload) => void;
};

function sortSchema(fields: MetadataSchemaField[]): MetadataSchemaField[] {
  return [...fields].sort((a, b) => {
    const reqA = a.is_required ? 1 : 0;
    const reqB = b.is_required ? 1 : 0;
    if (reqA !== reqB) return reqB - reqA;

    const orderA = Number.isFinite(Number(a.display_order)) ? Number(a.display_order) : 9999;
    const orderB = Number.isFinite(Number(b.display_order)) ? Number(b.display_order) : 9999;
    if (orderA !== orderB) return orderA - orderB;

    return String(a.field_label || a.field_name || '').localeCompare(
      String(b.field_label || b.field_name || '')
    );
  });
}

function toFieldLabel(field: MetadataSchemaField): string {
  if (field.field_label?.trim()) return field.field_label.trim();
  return String(field.field_name || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function shouldUseTextarea(field: MetadataSchemaField): boolean {
  const key = `${field.field_name} ${field.field_label || ''}`.toLowerCase();
  if (field.field_type === 'array') return true;
  return /(description|details|terms|clause|scope|condition|note|address|instructions|background)/.test(key);
}

export default function CreateDraftDocumentDialog({
  open,
  onOpenChange,
  onGenerated,
}: CreateDraftDocumentDialogProps) {
  const [docTypes, setDocTypes] = React.useState<DocumentTypeListItem[]>([]);
  const [schemaFields, setSchemaFields] = React.useState<MetadataSchemaField[]>([]);
  const [selectedTypeId, setSelectedTypeId] = React.useState<string>('');
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [titleOverride, setTitleOverride] = React.useState('');
  const [specialInstructions, setSpecialInstructions] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const [loadingTypes, setLoadingTypes] = React.useState(false);
  const [loadingSchema, setLoadingSchema] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;

    let active = true;
    const loadTypes = async () => {
      setLoadingTypes(true);
      setSubmitError(null);
      try {
        const items = await listDocumentTypes({ includeSchema: false, activeOnly: true });
        const normalized = items
          .filter((item) => item?.id && item?.name)
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        if (!active) return;

        setDocTypes(normalized);
        setSelectedTypeId((prev) => {
          if (prev && normalized.some((item) => item.id === prev)) return prev;
          return normalized[0]?.id || '';
        });
      } catch (error: any) {
        if (!active) return;
        setDocTypes([]);
        setSelectedTypeId('');
        setSubmitError(error?.message || 'Failed to load document types.');
      } finally {
        if (active) setLoadingTypes(false);
      }
    };

    void loadTypes();
    return () => {
      active = false;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open || !selectedTypeId) {
      setSchemaFields([]);
      setAnswers({});
      setFieldErrors({});
      return;
    }

    let active = true;
    const loadSchema = async () => {
      setLoadingSchema(true);
      setSubmitError(null);
      try {
        const response = await getDocumentTypeSchema(selectedTypeId);
        if (!active) return;
        const fields = sortSchema(Array.isArray(response?.schema) ? response.schema : []);
        setSchemaFields(fields);
        setAnswers({});
        setFieldErrors({});
        setTitleOverride('');
      } catch (error: any) {
        if (!active) return;
        setSchemaFields([]);
        setAnswers({});
        setFieldErrors({});
        setSubmitError(error?.message || 'Failed to load fields for the selected document type.');
      } finally {
        if (active) setLoadingSchema(false);
      }
    };

    void loadSchema();
    return () => {
      active = false;
    };
  }, [open, selectedTypeId]);

  const selectedType = React.useMemo(
    () => docTypes.find((item) => item.id === selectedTypeId) || null,
    [docTypes, selectedTypeId]
  );

  const visibleFields = React.useMemo(
    () => schemaFields.filter((field) => field.is_displayed !== false),
    [schemaFields]
  );

  const requiredFields = React.useMemo(
    () => visibleFields.filter((field) => field.is_required),
    [visibleFields]
  );

  const generatedTitlePreview = React.useMemo(() => {
    if (!selectedType) return 'Draft Document';
    return buildDraftDocumentTitle({
      documentTypeName: selectedType.name,
      documentTypeKey: selectedType.key,
      schema: visibleFields,
      answers,
      specialInstructions,
    });
  }, [answers, selectedType, specialInstructions, visibleFields]);

  const updateAnswer = React.useCallback((fieldName: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [fieldName]: value }));
    setFieldErrors((prev) => {
      if (!prev[fieldName]) return prev;
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
  }, []);

  const validate = React.useCallback((): boolean => {
    const nextErrors: Record<string, string> = {};
    for (const field of requiredFields) {
      const value = String(answers[field.field_name] || '').trim();
      if (!value) {
        nextErrors[field.field_name] = `${toFieldLabel(field)} is required.`;
      }
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [answers, requiredFields]);

  const handleGenerate = React.useCallback(async () => {
    if (!selectedType) {
      setSubmitError('Choose a document type to continue.');
      return;
    }

    if (!validate()) {
      setSubmitError('Please fill all required fields before generating the draft.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const title = titleOverride.trim() || generatedTitlePreview;
      const content = buildDraftDocumentContent({
        documentTypeName: selectedType.name,
        documentTypeKey: selectedType.key,
        schema: visibleFields,
        answers,
        specialInstructions,
      });
      const contentText = extractTextFromTiptap(content);

      const payload: GeneratedDraftPayload = {
        title,
        content,
        contentText,
        generatedAtIso: new Date().toISOString(),
        documentTypeName: selectedType.name,
        documentTypeId: selectedType.id,
        documentTypeKey: selectedType.key,
        specialInstructions: String(specialInstructions || '').trim() || undefined,
        answers: Object.fromEntries(
          Object.entries(answers).map(([key, value]) => [key, String(value || '').trim()])
        ),
      };

      onOpenChange(false);
      onGenerated?.(payload);
    } catch (error: any) {
      setSubmitError(error?.message || 'Failed to generate draft document.');
    } finally {
      setSubmitting(false);
    }
  }, [
    answers,
    generatedTitlePreview,
    onGenerated,
    onOpenChange,
    selectedType,
    specialInstructions,
    titleOverride,
    validate,
    visibleFields,
  ]);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
      if (!nextOpen) {
        setSubmitError(null);
        setFieldErrors({});
      }
    },
    [onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border/60">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <FilePlus2 className="h-4 w-4" />
            Create Draft Document
          </DialogTitle>
          <DialogDescription>
            Choose a template type, answer key fields, and generate a structured draft directly into your editor.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="draft-doc-type">Document Type</Label>
            <Select value={selectedTypeId} onValueChange={setSelectedTypeId} disabled={loadingTypes || submitting}>
              <SelectTrigger id="draft-doc-type">
                <SelectValue placeholder={loadingTypes ? 'Loading document types...' : 'Choose a document type'} />
              </SelectTrigger>
              <SelectContent>
                {docTypes.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingTypes && docTypes.length === 0 ? (
              <p className="text-xs text-amber-600">No document types are configured for this organization yet.</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="draft-title">Draft Title</Label>
            <Input
              id="draft-title"
              value={titleOverride}
              onChange={(e) => setTitleOverride(e.target.value)}
              placeholder={generatedTitlePreview}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">Leave empty to auto-generate title: {generatedTitlePreview}</p>
          </div>

          <div className="space-y-3 rounded-lg border border-border/60 p-4 bg-muted/20">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4" />
              Required Information
            </div>

            {loadingSchema ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading fields...
              </div>
            ) : visibleFields.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This document type has no visible schema fields. You can still generate a draft with special instructions.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {visibleFields.map((field) => {
                  const label = toFieldLabel(field);
                  const value = String(answers[field.field_name] || '');
                  const error = fieldErrors[field.field_name];
                  const longInput = shouldUseTextarea(field);

                  return (
                    <div
                      key={field.field_name}
                      className={cn('space-y-1.5', longInput ? 'md:col-span-2' : 'md:col-span-1')}
                    >
                      <Label htmlFor={`draft-field-${field.field_name}`}>
                        {label}
                        {field.is_required ? <span className="text-destructive"> *</span> : null}
                      </Label>

                      {field.field_type === 'boolean' ? (
                        <Select
                          value={value}
                          onValueChange={(nextValue) => updateAnswer(field.field_name, nextValue)}
                          disabled={submitting}
                        >
                          <SelectTrigger id={`draft-field-${field.field_name}`}>
                            <SelectValue placeholder="Select Yes/No" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Yes">Yes</SelectItem>
                            <SelectItem value="No">No</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : field.field_type === 'date' ? (
                        <Input
                          id={`draft-field-${field.field_name}`}
                          type="date"
                          value={value}
                          onChange={(e) => updateAnswer(field.field_name, e.target.value)}
                          disabled={submitting}
                        />
                      ) : field.field_type === 'number' ? (
                        <Input
                          id={`draft-field-${field.field_name}`}
                          type="number"
                          value={value}
                          onChange={(e) => updateAnswer(field.field_name, e.target.value)}
                          disabled={submitting}
                        />
                      ) : longInput ? (
                        <Textarea
                          id={`draft-field-${field.field_name}`}
                          value={value}
                          onChange={(e) => updateAnswer(field.field_name, e.target.value)}
                          placeholder={field.example_value || `Enter ${label.toLowerCase()}`}
                          rows={4}
                          disabled={submitting}
                        />
                      ) : (
                        <Input
                          id={`draft-field-${field.field_name}`}
                          value={value}
                          onChange={(e) => updateAnswer(field.field_name, e.target.value)}
                          placeholder={field.example_value || `Enter ${label.toLowerCase()}`}
                          disabled={submitting}
                        />
                      )}

                      {error ? <p className="text-xs text-destructive">{error}</p> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="draft-special-instructions">Special Instructions (Optional)</Label>
            <Textarea
              id="draft-special-instructions"
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="Add tone, formatting, mandatory clauses, or anything specific you want in the draft."
              rows={4}
              disabled={submitting}
            />
          </div>

          {submitError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <span>{submitError}</span>
            </div>
          ) : null}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/60">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleGenerate()} disabled={submitting || loadingTypes || loadingSchema || !selectedTypeId}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
            <span className="ml-2">Generate Draft</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
