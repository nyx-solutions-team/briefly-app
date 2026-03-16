"use client";

import AppLayout from '@/components/layout/app-layout';
import { AccessDenied } from '@/components/access-denied';
import DocumentsHomePage from '@/app/documents/home/page';
import { useAuth } from '@/hooks/use-auth';
import { getOrgFeatures } from '@/lib/org-features';

export default function EditorHomePage() {
  const { bootstrapData } = useAuth();
  const { editorEnabled } = getOrgFeatures(bootstrapData?.orgSettings);

  if (bootstrapData && !editorEnabled) {
    return (
      <AppLayout>
        <AccessDenied
          title="Document Studio Not Available"
          message="Document Studio is not enabled for this workspace."
        />
      </AppLayout>
    );
  }

  return <DocumentsHomePage />;
}
