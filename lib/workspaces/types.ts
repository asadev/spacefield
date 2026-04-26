// Workspace type definitions — shared between server and client.

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  created_by: string | null;
  created_at: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  joined_at: string;
  email?: string | null;
}

export interface WorkspaceInvite {
  id: string;
  workspace_id: string;
  email: string;
  role: Exclude<WorkspaceRole, "owner">;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  invited_by: string | null;
  created_at: string;
}

export interface WorkspaceDataRow<T = unknown> {
  workspace_id: string;
  namespace: string;
  key: string;
  value: T;
  updated_at: string;
  updated_by: string | null;
}

export interface WorkspaceWithRole extends Workspace {
  role: WorkspaceRole;
}

// Selected workspace in client state. `null` === "Personal (local only)".
export type SelectedWorkspace =
  | { kind: "personal" }
  | { kind: "team"; id: string; slug: string; name: string; role: WorkspaceRole };

export const WORKSPACE_STORAGE_KEY = "solutions:workspace:current:v1";
