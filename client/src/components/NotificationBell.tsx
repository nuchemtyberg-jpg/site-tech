import { useState } from "react";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useNotifications, useUnreadNotificationCount, useMarkNotificationRead, useMarkAllNotificationsRead,
} from "@/hooks/use-todos";
import { cn } from "@/lib/utils";
import type { Notification } from "@shared/schema";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const { data: unread } = useUnreadNotificationCount();
  const { data: notifications = [], isLoading } = useNotifications({ enabled: open });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const count = unread?.count ?? 0;

  const handleClick = (n: Notification) => {
    if (!n.isRead) markRead.mutate(n.id);
    setOpen(false);
    // Deep-link to the related todo so its dialog (with Updates) opens on arrival
    const todoParam = n.todoId ? `todo=${n.todoId}` : "";
    if (n.relatedEntityType === "opportunity" && n.relatedEntityId) {
      navigate(`/bidding/${n.relatedEntityId}`);
    } else if (n.projectId) {
      navigate(`/projects/${n.projectId}?tab=todos${todoParam ? `&${todoParam}` : ""}`);
    } else {
      navigate(`/my-work${todoParam ? `?${todoParam}` : ""}`);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative min-h-[44px] min-w-[44px]"
          aria-label={count > 0 ? `Notifications (${count} unread)` : "Notifications"}
          data-testid="button-notification-bell"
        >
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span
              className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center"
              data-testid="badge-unread-count"
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold">Notifications</p>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
          ) : notifications.length === 0 ? (
            <div className="text-center py-10 px-4">
              <Inbox className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">You'll see todo assignments and workflow updates here.</p>
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClick(n)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/60 transition-colors flex gap-2.5 items-start",
                  !n.isRead && "bg-primary/5",
                )}
                data-testid={`notification-item-${n.id}`}
              >
                {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
                <div className={cn("min-w-0 flex-1", n.isRead && "pl-[18px]")}>
                  <p className={cn("text-sm leading-snug break-words", !n.isRead && "font-medium")}>{n.title}</p>
                  {n.message && <p className="text-xs text-muted-foreground mt-0.5 break-words">{n.message}</p>}
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    {n.createdAt ? formatDistanceToNow(new Date(n.createdAt as unknown as string), { addSuffix: true }) : ""}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
