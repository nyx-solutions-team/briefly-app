"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { apiFetch, getApiContext } from '@/lib/api';

// Types for audit events
export type AuditEvent = {
    id: string;
    actor: string;
    actorId: string;
    type: string;
    docId?: string;
    title?: string;
    note?: string;
    path?: string;
    ts: number;
    department?: string;
    actorRole?: string;
};

// Backend response format
type AuditEventResponse = {
    id: string;
    org_id: string;
    actor_user_id: string;
    type: string;
    doc_id?: string;
    title?: string;
    note?: string;
    path?: string;
    ts: string;
    department_id?: string;
    actor_email?: string;
    actor_role?: string;
};

// Paginated response from backend
type AuditPaginatedResponse = {
    items: AuditEventResponse[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};

// Actor for filter dropdown
export type AuditActor = {
    id: string;
    email: string;
    name: string;
};

// Filter parameters
export type AuditFilters = {
    type?: string;
    actors?: string[];
    from?: string;
    to?: string;
    excludeSelf?: boolean;
    page?: number;
    limit?: number;
};

export function AuditProvider({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}

export function useAudit() {
    const [events, setEvents] = useState<AuditEvent[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [includeSelf, setIncludeSelf] = useState(false);

    // Pagination state
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [pageSize, setPageSize] = useState(15);

    // Available actors for filter
    const [availableActors, setAvailableActors] = useState<AuditActor[]>([]);
    const [actorsLoading, setActorsLoading] = useState(false);

    const log = (_entry: {
        actor?: string;
        type?: string;
        docId?: string;
        title?: string;
        note?: string;
    }) => {
        // No-op: Audit logging is now handled by the backend
    };

    const clear = useCallback(() => {
        setEvents([]);
        setHasLoaded(false);
        setPage(1);
        setTotalPages(1);
        setTotalCount(0);
    }, []);

    // Load available actors for the filter dropdown
    const loadActors = useCallback(async () => {
        setActorsLoading(true);
        try {
            const { orgId } = getApiContext();
            if (!orgId) return;

            const data = await apiFetch<AuditActor[]>(`/orgs/${orgId}/audit/actors`);
            setAvailableActors(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to load audit actors:', error);
            setAvailableActors([]);
        } finally {
            setActorsLoading(false);
        }
    }, []);

    // Load audit events with filters and pagination
    const loadAudit = useCallback(async (filters: AuditFilters = {}) => {
        setIsLoading(true);
        try {
            const { orgId } = getApiContext();
            if (!orgId) {
                console.warn('No orgId available for audit fetch');
                setEvents([]);
                return;
            }

            // Build query params
            const params = new URLSearchParams();
            params.set('page', String(filters.page || page));
            params.set('limit', String(filters.limit || pageSize));

            if (filters.type && filters.type !== 'all') {
                params.set('type', filters.type);
            }
            if (filters.actors && filters.actors.length > 0) {
                params.set('actors', filters.actors.join(','));
            }
            if (filters.from) {
                params.set('from', filters.from);
            }
            if (filters.to) {
                params.set('to', filters.to);
            }
            if (filters.excludeSelf !== undefined ? filters.excludeSelf : !includeSelf) {
                params.set('excludeSelf', '1');
            }

            const data = await apiFetch<AuditPaginatedResponse>(`/orgs/${orgId}/audit?${params.toString()}`);

            // Map backend response to frontend format
            const mappedEvents: AuditEvent[] = (data.items || []).map((e) => ({
                id: e.id,
                actor: e.actor_email || e.actor_user_id || 'Unknown',
                actorId: e.actor_user_id,
                type: e.type,
                docId: e.doc_id,
                title: e.title,
                note: e.note,
                path: e.path,
                ts: new Date(e.ts).getTime(),
                department: e.department_id,
                actorRole: e.actor_role,
            }));

            setEvents(mappedEvents);
            setPage(data.page);
            setTotalPages(data.totalPages);
            setTotalCount(data.total);
            setHasLoaded(true);
        } catch (error) {
            console.error('Failed to load audit events:', error);
            setEvents([]);
        } finally {
            setIsLoading(false);
        }
    }, [includeSelf, page, pageSize]);

    return {
        log,
        events,
        clear,
        includeSelf,
        setIncludeSelf,
        isLoading,
        hasLoaded,
        loadAudit,
        // Pagination
        page,
        setPage,
        totalPages,
        totalCount,
        pageSize,
        setPageSize,
        // Actors for filter
        availableActors,
        actorsLoading,
        loadActors,
    };
}
