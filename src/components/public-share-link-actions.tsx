'use client';

import { useEffect, useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { getApiContext } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { getPublicShareUrl, readPublicShare, type PublicShareReference, type ShareKind } from '@/lib/public-share-links';

export function PublicShareLinkActions({ row, kind, active = true }: {
  row: PublicShareReference;
  kind: ShareKind;
  active?: boolean;
}) {
  const { bootstrapData } = useAuth();
  const { toast } = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const userId = bootstrapData?.user?.id || '';
  const orgId = getApiContext().orgId;

  useEffect(() => {
    const cached = readPublicShare({ userId, orgId, kind }, row.id);
    setUrl(getPublicShareUrl(row, kind, window.location.origin)
      || (cached ? getPublicShareUrl({ public_url: cached }, kind, window.location.origin) : null));
  }, [row, kind, userId, orgId]);

  if (!active) return null;
  if (!url) return <p className="mt-2 text-xs text-muted-foreground">Public URL unavailable. Create a new link to copy or open it.</p>;

  return (
    <div className="mt-2 space-y-2">
      <a href={url} target="_blank" rel="noopener noreferrer" className="block break-all text-xs text-primary hover:underline">{url}</a>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            toast({ title: 'Public link copied' });
          } catch {
            toast({ title: 'Unable to copy link', description: 'Select and copy the URL above.', variant: 'destructive' });
          }
        }}><Copy className="mr-1.5 h-3.5 w-3.5" />Copy link</Button>
        <Button type="button" variant="outline" size="sm" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open public link</a>
        </Button>
      </div>
    </div>
  );
}
