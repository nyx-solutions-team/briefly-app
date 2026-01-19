// API route for the enhanced agent - Using the same authentication approach as existing API calls
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    // Get the request body
    const body = await request.json();
    const { question, conversation } = body;

    if (!question) {
      return NextResponse.json(
        { error: 'Question is required' },
        { status: 400 }
      );
    }

    // Get the organization ID from cookies (same approach as existing API calls)
    const cookieStore = await cookies();
    const orgId = cookieStore.get('org-id')?.value || cookieStore.get('orgId')?.value;
    
    if (!orgId) {
      return NextResponse.json(
        { error: 'No organization selected - Please select an organization' },
        { status: 400 }
      );
    }

    // Get the authentication token using the same approach as existing API calls
    let authToken = null;
    try {
      // Import Supabase client
      const { supabase } = await import('@/lib/supabase');
      const session = await supabase.auth.getSession();
      authToken = session.data.session?.access_token;
    } catch (authError) {
      console.error('Auth error:', authError);
      return NextResponse.json(
        { error: 'Authentication failed - Please log in again' },
        { status: 401 }
      );
    }

    if (!authToken) {
      return NextResponse.json(
        { error: 'Authentication required - Please log in' },
        { status: 401 }
      );
    }

    // Forward the request to our backend service using the same approach as existing API calls
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787';
    
    // Streaming removed: use REST route directly
    const backendResponse = await fetch(`${baseUrl}/orgs/${orgId}/chat/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'X-Org-Id': orgId
      },
      body: JSON.stringify({
        question,
        conversation: conversation || [],
        memory: {} // REST endpoint supports memory; fill as needed
      })
    });

    // If the backend service returns an error, forward it
    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      return NextResponse.json(
        { error: errorData.error || `Backend service error: ${backendResponse.status}` },
        { status: backendResponse.status }
      );
    }

    // Return JSON
    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
