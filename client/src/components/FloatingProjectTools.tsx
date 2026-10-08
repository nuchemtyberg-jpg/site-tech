import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  ClipboardList, 
  ListTodo,
  Activity,
  FileText, 
  Camera, 
  Calendar,
  Mail,
  MessageSquareText,
  Settings,
  Wrench,
  X,
  ReceiptText
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FloatingProjectToolsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  hidden?: boolean;
}

const toolItems = [
  { value: "bids", label: "Bids & Contracts", icon: ReceiptText },
  { value: "documents", label: "Documents", icon: FileText },
  { value: "daily-reports", label: "Daily Reports", icon: Calendar },
  { value: "photos", label: "Photos", icon: Camera },
  { value: "tasks", label: "Tasks", icon: ClipboardList },
  { value: "todos", label: "Todos", icon: ListTodo },
  { value: "communications", label: "Communications", icon: Mail },
  { value: "rfis", label: "RFIs", icon: MessageSquareText },
  { value: "activity", label: "Activity", icon: Activity },
  { value: "settings", label: "Settings", icon: Settings },
];

export function FloatingProjectTools({ activeTab, onTabChange, hidden = false }: FloatingProjectToolsProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (hidden) return null;

  const activeItem = toolItems.find(item => item.value === activeTab);
  const ActiveIcon = activeItem?.icon || Wrench;

  const handleSelect = (value: string) => {
    onTabChange(value);
    setIsOpen(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            size="lg"
            className="rounded-full shadow-lg"
            data-testid="button-project-tools-fab"
          >
            {isOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <ActiveIcon className="h-6 w-6" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          align="end" 
          side="top" 
          className="w-48 mb-2"
          sideOffset={8}
        >
          {toolItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.value;
            return (
              <DropdownMenuItem
                key={item.value}
                onClick={() => handleSelect(item.value)}
                className={cn(
                  "min-h-[44px] cursor-pointer",
                  isActive && "bg-accent"
                )}
                data-testid={`menu-item-${item.value}`}
              >
                <Icon className="h-5 w-5 mr-3" />
                <span className="font-medium">{item.label}</span>
                {isActive && (
                  <span className="ml-auto text-xs text-muted-foreground">Current</span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
