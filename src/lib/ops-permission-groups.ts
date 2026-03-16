export type OpsPermissionDefinition = {
  key: string;
  label: string;
  description: string;
};

export type OpsPermissionGroup = {
  title: string;
  description: string;
  permissions: OpsPermissionDefinition[];
};

export const OPS_PERMISSION_GROUPS: OpsPermissionGroup[] = [
  {
    title: 'Admin Controls',
    description: 'These permissions decide who can change workspace structure, settings, and security posture.',
    permissions: [
      { key: 'org.manage_members', label: 'Manage Members', description: 'Invite, remove, and administer workspace members.' },
      { key: 'org.update_settings', label: 'Update Settings', description: 'Change org-wide settings and feature controls.' },
      { key: 'billing.manage', label: 'Manage Billing', description: 'Handle plan and billing level actions.' },
      { key: 'security.ip_bypass', label: 'IP Bypass', description: 'Bypass client IP restrictions when allowed.' },
    ],
  },
  {
    title: 'Team Controls',
    description: 'Use these for department visibility and team lead style operational access.',
    permissions: [
      { key: 'departments.read', label: 'View Teams', description: 'See department and team structure.' },
      { key: 'departments.manage_members', label: 'Manage Team Members', description: 'Move or manage users within teams.' },
      { key: 'audit.read', label: 'Read Audit', description: 'See workspace audit activity and admin history.' },
    ],
  },
  {
    title: 'Document Access',
    description: 'Core document handling permissions for reading, creation, edits, and sharing.',
    permissions: [
      { key: 'documents.read', label: 'Read Documents', description: 'Open and browse documents.' },
      { key: 'documents.create', label: 'Create Documents', description: 'Upload or create new documents.' },
      { key: 'documents.update', label: 'Edit Documents', description: 'Modify document content or metadata.' },
      { key: 'documents.delete', label: 'Delete Documents', description: 'Delete documents from active workspace.' },
      { key: 'documents.move', label: 'Move Documents', description: 'Move documents between folders or paths.' },
      { key: 'documents.link', label: 'Link Documents', description: 'Associate documents with related items or flows.' },
      { key: 'documents.version.manage', label: 'Manage Versions', description: 'Work with document history and versions.' },
      { key: 'documents.bulk_delete', label: 'Bulk Delete', description: 'Delete multiple documents in a single action.' },
      { key: 'documents.share', label: 'Share Documents', description: 'Create or manage secure sharing flows.' },
    ],
  },
  {
    title: 'Search, Storage, and AI',
    description: 'These permissions shape upload ability, search behavior, and chat access.',
    permissions: [
      { key: 'storage.upload', label: 'Upload Files', description: 'Send files into workspace storage and ingestion.' },
      { key: 'search.semantic', label: 'Semantic Search', description: 'Use semantic and enhanced search capabilities.' },
      { key: 'chat.access', label: 'Use Chat', description: 'Access the chat and AI assistance surfaces.' },
      { key: 'chat.save_sessions', label: 'Save Chat Sessions', description: 'Persist chat sessions and outputs.' },
    ],
  },
];

export const OPS_EDITABLE_PERMISSION_KEYS = OPS_PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((permission) => permission.key)
);
