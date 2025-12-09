"use client";

import * as React from 'react';
import AppLayout from '@/components/layout/app-layout';
import { useDocuments } from '@/hooks/use-documents';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select as UiSelect, SelectContent as UiSelectContent, SelectItem as UiSelectItem, SelectTrigger as UiSelectTrigger, SelectValue as UiSelectValue } from '@/components/ui/select';
import { formatAppDateTime } from '@/lib/utils';
import { H1 } from '@/components/typography';
import { PageHeader } from '@/components/page-header';
import { useCategories } from '@/hooks/use-categories';
import { FileText, User, UserCheck, Calendar, Tag, MessageSquare, Hash, Bookmark, FolderOpen, Link as LinkIcon, ArrowUp, ArrowDown, Crown } from 'lucide-react';
import { apiFetch, getApiContext } from '@/lib/api';

export default function EditDocumentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getDocumentById, updateDocument, removeDocument, createFolder, documents, folders } = useDocuments();
  const { categories } = useCategories();
  const doc = getDocumentById(params.id);
  const [saving, setSaving] = React.useState(false);

  const [form, setForm] = React.useState({
    title: doc?.title || '',
    filename: doc?.filename || doc?.name || '',
    subject: doc?.subject || '',
    sender: doc?.sender || '',
    receiver: doc?.receiver || '',
    documentDate: (doc as any)?.documentDate || '',
    documentType: (doc as any)?.documentType || (doc as any)?.type || '',
    category: (doc as any)?.category || '',
    keywords: ((doc as any)?.keywords || []).join(', '),
    tags: ((doc as any)?.tags || []).join(', '),
    description: (doc as any)?.description || '',
    folderPath: ((doc as any)?.folderPath || []).join('/'),
  });
  const [linkedIds, setLinkedIds] = React.useState<string[]>((doc as any)?.linkedDocumentIds || []);
  const [linkQuery, setLinkQuery] = React.useState('');
  const [relationships, setRelationships] = React.useState<{ linked: any[]; incoming: any[]; outgoing: any[]; versions: any[] }>({ linked: [], incoming: [], outgoing: [], versions: [] });
  const [relLoading, setRelLoading] = React.useState(false);

  const loadRelationships = React.useCallback(async () => {
    if (!doc) return;
    try {
      setRelLoading(true);
      const { orgId } = getApiContext();
      const data = await apiFetch(`/orgs/${orgId}/documents/${doc.id}/relationships`);
      setRelationships(data || { linked: [], incoming: [], outgoing: [], versions: [] });
    } catch (e) {
      console.error('Failed to load relationships in edit page:', e);
    } finally {
      setRelLoading(false);
    }
  }, [doc?.id]);

  React.useEffect(() => { loadRelationships(); }, [loadRelationships]);

  const onSave = async () => {
    setSaving(true);
    // ensure new folders exist
    const newPathArr = form.folderPath.split('/').filter(Boolean);
    for (let i = 0; i < newPathArr.length; i++) {
      const slice = newPathArr.slice(0, i + 1);
      const parent = slice.slice(0, -1);
      const name = slice[slice.length - 1];
      createFolder(parent, name);
    }

    if (!doc) { setSaving(false); return; }
    updateDocument(doc.id, {
      title: form.title,
      filename: form.filename,
      subject: form.subject,
      sender: form.sender,
      receiver: form.receiver,
      documentDate: form.documentDate,
      documentType: form.documentType || (doc as any).documentType,
      category: form.category,
      keywords: form.keywords.split(',').map((s: string) => s.trim()).filter(Boolean),
      tags: form.tags.split(',').map((s: string) => s.trim()).filter(Boolean),
      description: form.description,
      folderPath: newPathArr,
    });
    setSaving(false);
    router.push(`/documents/${doc.id}`);
  };

  const onDelete = () => {
    if (!doc) return;
    removeDocument(doc.id);
    router.push('/documents');
  };

  // Create proper back navigation to the document view
  const backHref = `/documents/${doc?.id ?? ''}`;

  return (
    <AppLayout>
      <div className="p-0 md:p-0 space-y-6">
        <PageHeader title="Edit Document" backHref={backHref} backLabel="Back to Document" sticky />
        <div className="px-4 md:px-6">

        {!doc ? (
          <div className="rounded-md border p-4 text-sm text-muted-foreground">Document not found.</div>
        ) : (
        <>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border bg-muted/20 p-4 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
                  <FileText className="h-4 w-4" />
                  <span>Basics</span>
                </div>
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <FileText className="h-4 w-4" />
                      Title
                    </label>
                    <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <FileText className="h-4 w-4" />
                      Filename
                    </label>
                    <Input value={form.filename} onChange={(e) => setForm({ ...form, filename: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <FolderOpen className="h-4 w-4" />
                      Folder
                    </label>
                    <div className="grid gap-2 md:grid-cols-2">
                      <UiSelect value={form.folderPath || ''} onValueChange={(v) => setForm({ ...form, folderPath: v === '__root__' ? '' : v })}>
                        <UiSelectTrigger className="w-full"><UiSelectValue placeholder="Select folder" /></UiSelectTrigger>
                        <UiSelectContent>
                          <UiSelectItem value="__root__">Root</UiSelectItem>
                          {folders.map((p, idx) => (
                            <UiSelectItem key={idx} value={p.join('/')}>{p.join('/')}</UiSelectItem>
                          ))}
                        </UiSelectContent>
                      </UiSelect>
                      <Input value={form.folderPath} onChange={(e) => setForm({ ...form, folderPath: e.target.value })} placeholder="Custom path e.g., Finance/2025/Q1" />
                    </div>
                    <p className="text-xs text-muted-foreground">Choose an existing folder or type a new nested path. We’ll create it for you.</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
                  <User className="h-4 w-4" />
                  <span>People & dates</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5 sm:col-span-2">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <MessageSquare className="h-4 w-4" />
                      Subject
                    </label>
                    <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <User className="h-4 w-4" />
                      Sender
                    </label>
                    <Input value={form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <UserCheck className="h-4 w-4" />
                      Receiver
                    </label>
                    <Input value={form.receiver} onChange={(e) => setForm({ ...form, receiver: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Document Date
                    </label>
                    <Input value={form.documentDate} onChange={(e) => setForm({ ...form, documentDate: e.target.value })} placeholder="YYYY-MM-DD" />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border bg-muted/20 p-4 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
                  <Tag className="h-4 w-4" />
                  <span>Classification</span>
                </div>
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Tag className="h-4 w-4" />
                      Document Type
                    </label>
                    <Input value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} placeholder="Invoice, Contract, Memo..." />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Bookmark className="h-4 w-4" />
                      Category
                    </label>
                    <UiSelect value={form.category || 'General'} onValueChange={(value) => setForm({ ...form, category: value })}>
                      <UiSelectTrigger className="w-full">
                        <UiSelectValue placeholder="Select category..." />
                      </UiSelectTrigger>
                      <UiSelectContent>
                        {categories.map((category) => (
                          <UiSelectItem key={category} value={category}>
                            {category}
                          </UiSelectItem>
                        ))}
                      </UiSelectContent>
                    </UiSelect>
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Hash className="h-4 w-4" />
                      Keywords
                    </label>
                    <Input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="Comma separated e.g. finance, q1, audit" />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Tag className="h-4 w-4" />
                      Tags
                    </label>
                    <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Comma separated e.g. urgent, vendor" />
                  </div>
                </div>
              </div>
              <div className="rounded-xl border bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
                    <MessageSquare className="h-4 w-4" />
                    <span>AI Summary</span>
                  </div>
                  <span className="text-xs text-muted-foreground">Aim for ~15 lines</span>
                </div>
                <Textarea
                  rows={15}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Summarize the document in plain language so anyone can grasp the essentials."
                  className="leading-relaxed bg-background/70"
                />
              </div>
            </div>

            <div className="rounded-xl border bg-muted/10 p-4 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
                  <LinkIcon className="h-4 w-4" />
                  <span>Document Relationships</span>
                </div>
                <span className="text-xs text-muted-foreground">Link related versions and files</span>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    Linked Documents ({(relationships.incoming?.length || 0) + (relationships.outgoing?.length || 0)})
                  </div>
                  {relLoading ? (
                    <div className="text-xs text-muted-foreground">Loading…</div>
                  ) : (
                    <div className="space-y-2">
                      {[...(relationships.outgoing || []), ...(relationships.incoming || [])].map((rel: any) => (
                        <div key={`${rel.id}-${rel.direction}`} className="flex items-center justify-between rounded-md border p-2 bg-background">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium" title={rel.title}>
                                {rel.title}
                              </span>
                              {rel.versionNumber && (
                                <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">v{rel.versionNumber}</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                              <span>{rel.type}</span>
                              <span className={rel.direction === 'outgoing' ? 'text-green-600' : 'text-blue-600'}>
                                {rel.direction === 'outgoing' ? '↗ links to' : '↙ linked from'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" asChild>
                              <Link href={`/documents/${rel.id}`} target="_blank">View</Link>
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={async () => {
                              try { const { orgId } = getApiContext(); await apiFetch(`/orgs/${orgId}/documents/${doc.id}/link/${rel.id}`, { method: 'DELETE' }); await loadRelationships(); } catch(e){ console.error('unlink failed', e);} }}>Remove</Button>
                          </div>
                        </div>
                      ))}
                      {((relationships.incoming?.length || 0) + (relationships.outgoing?.length || 0)) === 0 && (
                        <div className="text-xs text-muted-foreground">No links yet.</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-dashed bg-background/60 p-3 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Search and link documents
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Find related files to keep versions and references tidy.
                  </div>
                  <Input
                    placeholder="Search by title, sender, or type..."
                    value={linkQuery}
                    onChange={(e) => setLinkQuery(e.target.value)}
                    className="mb-2"
                  />
                  {linkQuery.trim() && (
                    <div className="max-h-48 overflow-y-auto rounded-md border bg-background">
                      <ServerSearchResults docId={doc.id} query={linkQuery} onAdd={async (targetId) => {
                        try { const { orgId } = getApiContext(); await apiFetch(`/orgs/${orgId}/documents/${doc.id}/link`, { method: 'POST', body: { linkedId: targetId, linkType: 'related' } }); setLinkQuery(''); await loadRelationships(); } catch(e){ console.error('link failed', e);} }} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Version History */}
            <div className="rounded-xl border bg-muted/10 p-4 shadow-sm space-y-3">
              <div className="text-xs font-medium text-muted-foreground">Version History</div>
              <div className="space-y-2">
                {doc?.versionGroupId && (
                  <div className="p-3 rounded-md border bg-background/50 flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-medium">{doc?.title || doc?.filename || 'Untitled'}</span>
                      <span className="ml-2 text-xs text-muted-foreground">v{doc?.versionNumber || 1}</span>
                      <span className="ml-2 inline-flex items-center gap-1 text-xs"><Crown className="h-3 w-3" /> Current</span>
                    </div>
                  </div>
                )}
                {(relationships.versions || []).sort((a:any,b:any) => (b.versionNumber||0)-(a.versionNumber||0)).map((v:any) => (
                  <div key={v.id} className="p-3 rounded-md border bg-background flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-medium">{v.title}</span>
                      <span className="ml-2 text-xs text-muted-foreground">v{v.versionNumber || 'Unknown'}</span>
                      {v.isCurrentVersion && <span className="ml-2 inline-flex items-center gap-1 text-xs"><Crown className="h-3 w-3" /> Current</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {!v.isCurrentVersion && (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={async () => {
                          try { const { orgId } = getApiContext(); await apiFetch(`/orgs/${orgId}/documents/${v.id}/set-current`, { method: 'POST' }); await loadRelationships(); } catch(e){ console.error(e);} }}>Set Current</Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={async () => {
                        try { const { orgId } = getApiContext(); await apiFetch(`/orgs/${orgId}/documents/${doc?.id}/move-version`, { method: 'POST', body: { fromVersion: v.versionNumber, toVersion: (v.versionNumber||1)+1 } }); await loadRelationships(); } catch(e){ console.error(e);} }} title="Move later"><ArrowDown className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={async () => {
                        try { const { orgId } = getApiContext(); await apiFetch(`/orgs/${orgId}/documents/${doc?.id}/move-version`, { method: 'POST', body: { fromVersion: v.versionNumber, toVersion: (v.versionNumber||1)-1 } }); await loadRelationships(); } catch(e){ console.error(e);} }} title="Move earlier"><ArrowUp className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
              <Button variant="destructive" onClick={onDelete}>Delete</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
                <Button onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              </div>
            </div>
          </CardContent>
        </Card>
        </>
        )}
      </div>
      </div>
    </AppLayout>
  );
}

function ServerSearchResults({ docId, query, onAdd }: { docId: string; query: string; onAdd: (id: string) => void }) {
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { orgId } = getApiContext();
        const data = await apiFetch<any[]>(`/orgs/${orgId}/documents?q=${encodeURIComponent(query)}`);
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [docId, query]);
  if (loading) return <div className="p-3 text-xs text-muted-foreground">Loading…</div>;
  if (!rows || rows.length === 0) return <div className="p-3 text-sm text-muted-foreground text-center">No documents found matching "{query}"</div>;
  return (
    <div>
      {rows.map((d:any) => (
        <div key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-accent/40 border-b last:border-b-0">
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium" title={d.title || d.name}>{d.title || d.name}</div>
            <div className="text-xs text-muted-foreground">
              {(d.documentType || d.type)}
              {d.versionGroupId && <span className="ml-1">v{d.versionNumber || d.version || 1}</span>}
            </div>
          </div>
          <Button size="sm" variant="default" onClick={() => onAdd(d.id)} className="text-xs h-7">Add</Button>
        </div>
      ))}
    </div>
  );
}
