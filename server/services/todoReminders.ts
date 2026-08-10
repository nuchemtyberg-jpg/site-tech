import { storage } from "../storage";
import { logActivity, systemActor } from "./activityLog";

// Daily due-date reminders (Phase 1 spec §22).
//
// Once per day (plus on startup), create an in-app notification for each open
// todo that is due today or overdue. Duplicate safety comes from the storage
// query itself: a todo is only a candidate when no notification of the same
// type ('due_today' / 'overdue') already exists for it, so restarts and
// repeated runs never remind twice. The bell UI reads the notifications table
// directly — no client changes needed.

let running = false;

export async function runTodoDueReminders(today?: string): Promise<{ created: number }> {
  if (running) return { created: 0 }; // guard against overlapping runs in-process
  running = true;
  try {
    const todayStr = today || new Date().toISOString().slice(0, 10);
    const candidates = await storage.getTodosNeedingDueReminder(todayStr);
    let created = 0;

    for (const todo of candidates) {
      const isOverdue = todo.reminderType === "overdue";
      try {
        const notification = await storage.createReminderNotificationIfAbsent({
          userId: todo.assignedToUserId,
          type: todo.reminderType,
          title: isOverdue ? `Overdue: ${todo.title}` : `Due today: ${todo.title}`,
          message: isOverdue
            ? `This todo was due ${todo.dueDate} and is still open.`
            : `This todo is due today (${todo.dueDate}).`,
          projectId: todo.projectId,
          todoId: todo.id,
          relatedEntityType: "todo",
          relatedEntityId: todo.id,
          isRead: false,
        });
        if (!notification) continue; // another instance/run already reminded — skip logging
        created++;

        await logActivity({
          projectId: todo.projectId,
          entityType: "notification",
          entityId: notification.id,
          action: isOverdue ? "todo_overdue_reminder_sent" : "todo_due_today_reminder_sent",
          actor: systemActor(),
          description: isOverdue
            ? `System sent an overdue reminder for todo "${todo.title}" (due ${todo.dueDate}).`
            : `System sent a due-today reminder for todo "${todo.title}".`,
          metadata: { todoId: todo.id, dueDate: todo.dueDate, reminderType: todo.reminderType },
        });
      } catch (err) {
        console.error(`[TodoReminders] Failed to create ${todo.reminderType} reminder for todo ${todo.id}:`, err);
      }
    }

    if (created > 0) {
      console.log(`[TodoReminders] Created ${created} due-date reminder notification(s) for ${todayStr}`);
    }
    return { created };
  } finally {
    running = false;
  }
}

const HOURLY_MS = 60 * 60 * 1000;

// Run shortly after startup, then hourly. The hourly cadence keeps the check
// simple (no cron dependency) and catches the day rollover promptly; the
// per-todo/type dedupe in storage makes every extra run a no-op.
export function startTodoReminderScheduler(): void {
  setTimeout(() => {
    runTodoDueReminders().catch(err => console.error("[TodoReminders] Startup run failed:", err));
  }, 10_000);
  const timer = setInterval(() => {
    runTodoDueReminders().catch(err => console.error("[TodoReminders] Scheduled run failed:", err));
  }, HOURLY_MS);
  timer.unref?.();
}
