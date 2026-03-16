"use client";

export type OrgPlanFeatureEntitlements = {
  editorEnabled: boolean;
  approvalsEnabled: boolean;
  workflowsEnabled: boolean;
};

const PLAN_FEATURE_ENTITLEMENTS: Record<string, OrgPlanFeatureEntitlements> = {
  free: {
    editorEnabled: false,
    approvalsEnabled: false,
    workflowsEnabled: false,
  },
  paid_tier1: {
    editorEnabled: true,
    approvalsEnabled: true,
    workflowsEnabled: true,
  },
  enterprise: {
    editorEnabled: true,
    approvalsEnabled: true,
    workflowsEnabled: true,
  },
};

export function getOrgPlanFeatureEntitlements(planKey: string | null | undefined): OrgPlanFeatureEntitlements {
  return PLAN_FEATURE_ENTITLEMENTS[String(planKey || 'paid_tier1').toLowerCase()] || PLAN_FEATURE_ENTITLEMENTS.paid_tier1;
}

export function formatOrgPlanLabel(planKey: string | null | undefined) {
  const key = String(planKey || 'paid_tier1').trim();
  if (!key) return 'Custom plan';
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
