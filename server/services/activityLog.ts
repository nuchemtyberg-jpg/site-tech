import { storage } from "../storage";
import type { InsertActivityLog, User } from "@shared/schema";

// Reusable activity/audit logging service.
// Records meaningful business events (todo lifecycle, project status changes,
// workflow executions) with a human actor or "System" for automated actions.
// Future modules (RFPs, Estimates, Change Orders, ...) log via the same
// service using their own entityType/entityId.

export const SYSTEM_ACTOR_NAME = "System";

export type Actor = { id: string | null; name: string };

export function actorFromUser(user: User | undefined | null): Actor {
  if (!user) return systemActor();
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return { id: user.id, name: name || user.email || "Unknown user" };
}

export function systemActor(): Actor {
  return { id: null, name: SYSTEM_ACTOR_NAME };
}

export async function logActivity(params: {
  projectId?: number | null;
  entityType: string;
  entityId?: number | null;
  action: string;
  actor: Actor;
  description: string;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const log: InsertActivityLog = {
      projectId: params.projectId ?? null,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      action: params.action,
      actorUserId: params.actor.id,
      actorName: params.actor.name,
      description: params.description,
      metadata: params.metadata ?? null,
    };
    await storage.createActivityLog(log);
  } catch (err) {
    // Activity logging must never break the primary action
    console.error("[ActivityLog] Failed to record activity:", err);
  }
}
