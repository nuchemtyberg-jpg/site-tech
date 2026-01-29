import { useState, KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function TagInput({ value, onChange, placeholder = "Add tag...", className }: TagInputProps) {
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && inputValue === "" && value.length > 0) {
      removeTag(value.length - 1);
    }
  };

  const addTag = () => {
    const tag = inputValue.trim().toLowerCase();
    if (tag && !value.includes(tag)) {
      onChange([...value, tag]);
    }
    setInputValue("");
  };

  const removeTag = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-wrap gap-1 p-2 border rounded-md bg-[#ffffff]">
      {value.map((tag, index) => (
        <Badge 
          key={tag} 
          variant="secondary" 
          className="flex items-center gap-1 text-xs"
          data-testid={`tag-${tag}`}
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(index)}
            className="ml-1 hover:text-destructive"
            data-testid={`button-remove-tag-${tag}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addTag}
        placeholder={value.length === 0 ? placeholder : ""}
        className="flex-1 min-w-20 border-0 p-0 h-6 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
        data-testid="input-tag"
      />
    </div>
  );
}
