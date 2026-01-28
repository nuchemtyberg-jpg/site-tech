import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface TimePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function TimePicker({ value, onChange, disabled, className }: TimePickerProps) {
  const [hour, setHour] = useState<string>("12");
  const [minute, setMinute] = useState<string>("00");
  const [period, setPeriod] = useState<string>("AM");

  useEffect(() => {
    if (value) {
      const [hours24, mins] = value.split(":");
      let h = parseInt(hours24, 10);
      if (isNaN(h)) h = 12;
      const p = h >= 12 ? "PM" : "AM";
      if (h === 0) h = 12;
      else if (h > 12) h -= 12;
      setHour(h.toString().padStart(2, "0"));
      setMinute(mins || "00");
      setPeriod(p);
    } else {
      setHour("12");
      setMinute("00");
      setPeriod("AM");
    }
  }, [value]);

  const updateTime = (newHour: string, newMinute: string, newPeriod: string) => {
    let h = parseInt(newHour, 10);
    if (newPeriod === "PM" && h !== 12) h += 12;
    if (newPeriod === "AM" && h === 12) h = 0;
    const time24 = `${h.toString().padStart(2, "0")}:${newMinute}`;
    onChange?.(time24);
  };

  const handleHourChange = (newHour: string) => {
    setHour(newHour);
    updateTime(newHour, minute, period);
  };

  const handleMinuteChange = (newMinute: string) => {
    setMinute(newMinute);
    updateTime(hour, newMinute, period);
  };

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    updateTime(hour, minute, newPeriod);
  };

  const hours = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, "0"));
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Select value={hour} onValueChange={handleHourChange} disabled={disabled}>
        <SelectTrigger className="w-[70px]" data-testid="time-picker-hour">
          <SelectValue placeholder="HH" />
        </SelectTrigger>
        <SelectContent>
          {hours.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground">:</span>
      <Select value={minute} onValueChange={handleMinuteChange} disabled={disabled}>
        <SelectTrigger className="w-[70px]" data-testid="time-picker-minute">
          <SelectValue placeholder="MM" />
        </SelectTrigger>
        <SelectContent>
          {minutes.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={period} onValueChange={handlePeriodChange} disabled={disabled}>
        <SelectTrigger className="w-[70px]" data-testid="time-picker-period">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="AM">AM</SelectItem>
          <SelectItem value="PM">PM</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
