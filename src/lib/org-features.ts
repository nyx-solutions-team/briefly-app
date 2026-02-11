"use client";

export type OrgFeatures = {
  editorEnabled: boolean;
  approvalsEnabled: boolean;
  approvalsUsable: boolean; // approvals require editor docs
};

export function getOrgFeatures(orgSettings: any): OrgFeatures {
  const editorEnabled = Boolean(orgSettings?.editor_enabled);
  const approvalsEnabled = Boolean(orgSettings?.approvals_enabled);
  return {
    editorEnabled,
    approvalsEnabled,
    approvalsUsable: editorEnabled && approvalsEnabled,
  };
}

