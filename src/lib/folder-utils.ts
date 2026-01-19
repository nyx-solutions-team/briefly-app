import { apiFetch, getApiContext } from './api';

export interface FolderResolutionResult {
  folder_id: string | null;
  folder_path: string[];
  folder_title?: string;
  message?: string;
}

/**
 * Resolve a folder path to a folder ID
 * @param folderPath Array of folder path segments
 * @returns Promise with folder resolution result
 */
export async function resolveFolderPathToId(folderPath: string[]): Promise<FolderResolutionResult> {
  const { orgId } = getApiContext();
  
  if (!orgId) {
    throw new Error('No organization context available');
  }

  if (folderPath.length === 0) {
    // Root folder - no ID needed
    return {
      folder_id: null,
      folder_path: [],
      message: 'Root folder - no ID needed'
    };
  }

  try {
    const pathStr = folderPath.join('/');
    const result = await apiFetch<FolderResolutionResult>(
      `/orgs/${orgId}/folders/resolve-id?path=${encodeURIComponent(pathStr)}`
    );
    
    return result;
  } catch (error) {
    console.error('Error resolving folder path to ID:', error);
    throw error;
  }
}

/**
 * Get folder ID for chat context
 * @param chatContext Chat context with folder path
 * @returns Promise with folder ID or null
 */
export async function getFolderIdForChat(chatContext: { type: string; id?: string; folderPath?: string[]; path?: string[] }): Promise<string | null> {
  console.log('🔍 getFolderIdForChat called with:', {
    type: chatContext.type,
    folderPath: chatContext.folderPath,
    path: chatContext.path
  });

  if (chatContext.type !== 'folder') {
    console.log('❌ Not a folder context, returning null');
    return null;
  }

  // Support both folderPath and path for backward compatibility
  const folderPath = chatContext.folderPath || chatContext.path;
  console.log('📁 Using folderPath:', folderPath);
  
  if (!folderPath) {
    console.log('❌ No folderPath provided, returning null');
    return null;
  }

  console.log('🔍 Calling resolveFolderPathToId with:', folderPath);
  const resolution = await resolveFolderPathToId(folderPath);
  console.log('📋 Resolution result:', resolution);
  
  return resolution.folder_id;
}

/**
 * Create proper chat endpoint URL for folder context
 * @param chatContext Chat context
 * @returns Promise with endpoint URL
 */
export async function createFolderChatEndpoint(chatContext: { type: string; id?: string; folderPath?: string[]; path?: string[] }): Promise<string> {
  const { orgId } = getApiContext();
  
  if (!orgId) {
    throw new Error('No organization context available');
  }

  console.log('🔍 createFolderChatEndpoint called with:', {
    type: chatContext.type,
    id: chatContext.id,
    folderPath: chatContext.folderPath,
    path: chatContext.path
  });

  if (chatContext.type === 'document' && chatContext.id) {
    console.log('📄 Using document endpoint');
    return `/orgs/${orgId}/chat/document/${chatContext.id}/stream`;
  } else if (chatContext.type === 'folder') {
    // Support both folderPath and path for backward compatibility
    const folderPath = chatContext.folderPath || chatContext.path;
    console.log('📁 Folder context detected, folderPath:', folderPath);
    
    // If we already have a concrete folder ID, prefer using it directly
    if (chatContext.id) {
      console.log('🆔 Using provided folder ID directly:', chatContext.id);
      return `/orgs/${orgId}/chat/folder/${chatContext.id}/stream`;
    }

    if (folderPath && folderPath.length > 0) {
      console.log('🔍 Resolving folder ID for path:', folderPath);
      const folderId = await getFolderIdForChat(chatContext);
      console.log('🆔 Resolved folderId:', folderId);
      
      if (folderId) {
        console.log('✅ Using folder endpoint:', `/orgs/${orgId}/chat/folder/${folderId}/stream`);
        return `/orgs/${orgId}/chat/folder/${folderId}/stream`;
      } else {
        // Fallback to organization chat if folder not found
        console.warn('❌ Folder not found, falling back to organization chat');
        return `/orgs/${orgId}/chat/stream`;
      }
    } else {
      console.log('⚠️ No folderPath provided, using organization endpoint');
    }
  }
  
  console.log('🌐 Using organization endpoint');
  return `/orgs/${orgId}/chat/stream`;
}
