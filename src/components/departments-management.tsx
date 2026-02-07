"use client";
import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiFetch, getApiContext } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';

type Department = { id: string; org_id: string; name: string; lead_user_id?: string | null; color?: string | null };
type OrgUser = { userId: string; displayName?: string | null; email?: string | null };

export default function DepartmentsManagement() {
  const { hasPermission } = useAuth();
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newColor, setNewColor] = React.useState<string>('default');
  const [orgUsers, setOrgUsers] = React.useState<OrgUser[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [members, setMembers] = React.useState<{ userId: string; role: 'lead'|'member'; displayName?: string|null }[]>([]);
  const [newMember, setNewMember] = React.useState<{ userId: string; role: 'lead'|'member' }>({ userId: '', role: 'member' });

  const refresh = React.useCallback(async () => {
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;
    setLoading(true);
    try {
      const list = await apiFetch<Department[]>(`/orgs/${orgId}/departments?includeMine=1`);
      setDepartments(list || []);
      if (!selected && list?.length) setSelected(list[0].id);
      const users = await apiFetch<any[]>(`/orgs/${orgId}/users`);
      setOrgUsers((users || []).map(u => ({ userId: u.userId, displayName: u.displayName || u.app_users?.display_name || '', email: u.email || '' })));
    } finally { setLoading(false); }
  }, [selected]);

  const loadMembers = React.useCallback(async (deptId: string) => {
    const orgId = getApiContext().orgId || '';
    if (!orgId) return;
    const rows = await apiFetch<any[]>(`/orgs/${orgId}/departments/${deptId}/users`);
    setMembers((rows || []).map(r => ({ userId: r.userId, role: r.role, displayName: r.displayName })));
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);
  React.useEffect(() => { if (selected) void loadMembers(selected); }, [selected, loadMembers]);

  const onCreate = async () => {
    const orgId = getApiContext().orgId || '';
    if (!newName.trim()) return;
    await apiFetch(`/orgs/${orgId}/departments`, { method: 'POST', body: { name: newName.trim(), color: newColor } });
    setNewName(''); setNewColor('default'); setCreating(false); refresh();
  };

  const onRename = async (dept: Department, name: string) => {
    const orgId = getApiContext().orgId || '';
    await apiFetch(`/orgs/${orgId}/departments/${dept.id}`, { method: 'PATCH', body: { name } });
    setDepartments(prev => prev.map(d => d.id === dept.id ? { ...d, name } : d));
  };

  const onSetColor = async (dept: Department, color: string) => {
    const orgId = getApiContext().orgId || '';
    await apiFetch(`/orgs/${orgId}/departments/${dept.id}`, { method: 'PATCH', body: { color } });
    setDepartments(prev => prev.map(d => d.id === dept.id ? { ...d, color } : d));
  };

  const onSetLead = async (dept: Department, userId: string | null) => {
    const orgId = getApiContext().orgId || '';
    await apiFetch(`/orgs/${orgId}/departments/${dept.id}`, { method: 'PATCH', body: { leadUserId: userId } });
    setDepartments(prev => prev.map(d => d.id === dept.id ? { ...d, lead_user_id: userId } : d));
  };

  const addMember = async () => {
    if (!selected || !newMember.userId) return;
    const orgId = getApiContext().orgId || '';
    await apiFetch(`/orgs/${orgId}/departments/${selected}/users`, { method: 'POST', body: newMember });
    setNewMember({ userId: '', role: 'member' });
    loadMembers(selected);
  };

  const removeMember = async (uid: string) => {
    if (!selected) return;
    const orgId = getApiContext().orgId || '';
    await apiFetch(`/orgs/${orgId}/departments/${selected}/users/${uid}`, { method: 'DELETE' });
    loadMembers(selected);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Departments</CardTitle>
        <p className="text-sm text-muted-foreground">Organize your team into departments. Admins can create, rename, and set a department lead. Leads can manage members of their department.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">{departments.length} departments</div>
          {hasPermission('org.update_settings') && (!creating ? (
            <Button onClick={() => setCreating(true)}>New Department</Button>
          ) : (
            <div className="flex gap-2 items-end">
              <Input placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} />
              <Select value={newColor} onValueChange={setNewColor}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Color" /></SelectTrigger>
                <SelectContent>
                  {['default','red','rose','orange','amber','yellow','lime','green','emerald','teal','cyan','sky','blue','indigo','violet','purple','fuchsia','pink'].map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={onCreate}>Create</Button>
              <Button variant="outline" onClick={() => { setCreating(false); setNewName(''); setNewColor('default'); }}>Cancel</Button>
            </div>
          ))}
        </div>

        {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              {departments.map(dept => (
                <div key={dept.id} className={`border rounded-md p-3 ${selected === dept.id ? 'ring-1 ring-primary' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    {hasPermission('org.update_settings') ? (
                      <Input defaultValue={dept.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== dept.name) onRename(dept, v); }} />
                    ) : (
                      <div className="text-sm font-medium">{dept.name}</div>
                    )}
                    <div className="flex items-center gap-2">
                      {hasPermission('org.update_settings') && (
                        <>
                          <Select value={(dept.color || 'default') as any} onValueChange={(v)=>onSetColor(dept, v)}>
                            <SelectTrigger className="w-[120px]"><SelectValue placeholder="Color" /></SelectTrigger>
                            <SelectContent>
                              {['default','red','rose','orange','amber','yellow','lime','green','emerald','teal','cyan','sky','blue','indigo','violet','purple','fuchsia','pink'].map(c => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select value={(dept.lead_user_id ?? '__none__') as any} onValueChange={(v) => onSetLead(dept, v === '__none__' ? null : v)}>
                            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Set lead" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">No lead</SelectItem>
                              {orgUsers.map(u => (
                                <SelectItem key={u.userId} value={u.userId}>
                                  {u.displayName || u.email || u.userId}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </>
                      )}
                      <Button variant="outline" size="sm" onClick={() => setSelected(dept.id)}>Manage</Button>
                    </div>
                  </div>
                </div>
              ))}
              {departments.length === 0 && <div className="text-sm text-muted-foreground">No departments yet.</div>}
            </div>
            <div className="space-y-3">
              <div className="text-sm font-medium">Members {selected ? '' : '(select a department)'}</div>
              {selected && (
                <>
                  <div className="flex gap-2 items-end">
                    <Select value={newMember.userId} onValueChange={(v) => setNewMember(m => ({ ...m, userId: v }))}>
                      <SelectTrigger className="w-[220px]"><SelectValue placeholder="Select user" /></SelectTrigger>
                      <SelectContent>
                        {orgUsers.map(u => (
                          <SelectItem key={u.userId} value={u.userId}>
                            {u.displayName || u.email || u.userId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={newMember.role} onValueChange={(v) => setNewMember(m => ({ ...m, role: v as any }))}>
                      <SelectTrigger className="w-[160px]"><SelectValue placeholder="Role" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="lead">Lead</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={addMember}>Add</Button>
                  </div>
                  <div className="rounded-md border divide-y">
                    {members.map(m => (
                      <div key={m.userId} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div className="truncate">{m.displayName || m.userId}</div>
                        <div className="flex items-center gap-2">
                          <div className="text-xs px-2 py-0.5 rounded border">{m.role}</div>
                          <Button size="sm" variant="outline" onClick={() => removeMember(m.userId)}>Remove</Button>
                        </div>
                      </div>
                    ))}
                    {members.length === 0 && <div className="p-3 text-xs text-muted-foreground">No members yet.</div>}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
