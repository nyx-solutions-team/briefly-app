"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, RefreshCw, ExternalLink, LogOut } from 'lucide-react';
import { apiFetch, getApiContext } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';

type IpCheckResult = {
  clientIp?: string;
  allowed: boolean;
  reason: string;
  userRole?: string;
  orgId?: string;
};

export function IpBlockedPage() {
  const [ipInfo, setIpInfo] = useState<IpCheckResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [hasInitialLoad, setHasInitialLoad] = useState(false);
  const MAX_RETRIES = 3;
  const { bootstrapData, signOut } = useAuth();
  const router = useRouter();

  const checkIpAccess = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const { orgId } = getApiContext();
      if (!orgId) {
        console.warn('No orgId found in API context');
        return;
      }

      const result = await apiFetch<IpCheckResult>(`/orgs/${orgId}/ip-check`);
      setIpInfo(result);
      setHasInitialLoad(true);
    } catch (error: any) {
      console.error('IP check failed:', error);
      const { orgId } = getApiContext();
      
      // If we get a 403 with IP_NOT_ALLOWED, that's expected on this page
      if (error?.status === 403 && error?.data?.code === 'IP_NOT_ALLOWED') {
        setIpInfo({
          clientIp: error.data.clientIp || undefined,
          allowed: false,
          reason: 'ip_blocked',
          userRole: error.data.userRole || undefined,
          orgId: orgId || undefined
        });
      } else {
        // Set a minimal error state if we can't fetch
        setIpInfo({
          clientIp: undefined,
          allowed: false,
          reason: 'validation_error',
          userRole: undefined,
          orgId: orgId || undefined
        });
      }
      setHasInitialLoad(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check if user has IP bypass permission and redirect them away
  useEffect(() => {
    if (bootstrapData?.permissions?.['security.ip_bypass'] === true) {
      console.log('User has IP bypass permission, redirecting away from IP blocked page');
      // Use router.push instead of window.location.href to avoid full page reload
      router.push('/');
      return;
    }
  }, [bootstrapData, router]);

  // Only run on initial load and when retry count changes (with max retry limit)
  useEffect(() => {
    if ((!hasInitialLoad || retryCount > 0) && retryCount <= MAX_RETRIES) {
      checkIpAccess();
    }
  }, [retryCount, checkIpAccess, hasInitialLoad]);

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Checking IP access...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If access is allowed, this component shouldn't be shown
  if (ipInfo?.allowed) {
    return null;
  }

  const getReasonMessage = (reason: string) => {
    switch (reason) {
      case 'ip_blocked':
        return 'Your IP address is not in the organization\'s allowlist';
      case 'allowlist_disabled':
        return 'IP allowlist is disabled';
      case 'admin_bypass':
        return 'Administrator bypass active';
      case 'settings_fetch_error':
        return 'Unable to verify IP settings';
      case 'validation_error':
        return 'IP validation error occurred';
      default:
        return 'Access denied for unknown reason';
    }
  };

  const isAdminBypassAvailable = ipInfo?.userRole === 'orgAdmin';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <Shield className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-xl">Access Restricted</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              {getReasonMessage(ipInfo?.reason || '')}
            </AlertDescription>
          </Alert>

          {ipInfo?.clientIp && ipInfo?.orgId && ipInfo?.userRole && (
            <div className="rounded-md bg-muted p-4 space-y-2">
              <div className="text-sm">
                <strong>Your IP:</strong> {ipInfo.clientIp}
              </div>
              <div className="text-sm">
                <strong>Organization:</strong> {ipInfo.orgId}
              </div>
              <div className="text-sm">
                <strong>Your Role:</strong> {ipInfo.userRole}
              </div>
            </div>
          )}

          {(isAdminBypassAvailable || bootstrapData?.permissions?.['security.ip_bypass'] === true) && (
            <Alert>
              <AlertDescription>
                {bootstrapData?.permissions?.['security.ip_bypass'] === true 
                  ? 'You have IP bypass permission but are still seeing this page. This might indicate a backend configuration issue.'
                  : 'As an administrator, you should be able to bypass IP restrictions. If you\'re seeing this message, there might be a configuration issue.'
                }
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            <h4 className="text-sm font-medium">What you can do:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>• Contact your organization administrator</li>
              <li>• Ask them to add your IP address to the allowlist</li>
              <li>• Try connecting from a different network</li>
              {isAdminBypassAvailable && (
                <li>• Check organization security settings</li>
              )}
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-4">
            <Button 
              onClick={handleRetry} 
              variant="outline" 
              className="flex-1"
              disabled={retryCount >= MAX_RETRIES}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {retryCount >= MAX_RETRIES ? 'Max Retries Reached' : 'Check Again'}
            </Button>
            <Button asChild className="flex-1">
              <a href="mailto:support@briefly.local" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Contact Support
              </a>
            </Button>
            <Button onClick={signOut} variant="secondary" className="flex-1">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>

          <div className="text-xs text-muted-foreground text-center pt-2">
            This security measure protects your organization's data by restricting access to approved IP addresses.
            {retryCount > 0 && (
              <div className="mt-2">
                Retry attempts: {retryCount}/{MAX_RETRIES}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default IpBlockedPage;
