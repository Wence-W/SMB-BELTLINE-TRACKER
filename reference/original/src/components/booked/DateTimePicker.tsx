// Custom date & time picker for Appointment Date & Time (Gretchen, 2026-08-05).
// Replaces the native <input type="datetime-local"> whose OS/browser time
// spinner had a "scroll lock" bug (mouse-wheel scroll over the widget could
// hijack page scroll / get stuck) and no visible close affordance. This
// component keeps the same underlying value format
// ("YYYY-MM-DDTHH:mm", 24h) so storage, import/export, and display helpers
// (formatDateTimeEST etc.) don't need to change — only the editing UI does.
//
// Time is picked via three independent, self-contained scroll columns
// (Hour 01–12, Minute 00–59, AM/PM) built on Radix ScrollArea, so scrolling
// inside a column never escapes to the page ("scroll lock" fixed by
// construction — each column owns its own scroll, nothing else does).

import { CalendarIcon, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")); // 01–12
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")); // 00–59

interface Parsed {
  year: number;
  month: number; // 1-12
  day: number;
  hour12: string; // "01".."12"
  minute: string; // "00".."59"
  period: "AM" | "PM";
}

function parseValue(value: string): Parsed | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const hour24 = Number(h);
  const period: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return {
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour12: String(hour12).padStart(2, "0"),
    minute: mi,
    period,
  };
}

function toValue(p: Parsed): string {
  let hour24 = Number(p.hour12) % 12;
  if (p.period === "PM") hour24 += 12;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(hour24)}:${p.minute}`;
}

function formatDisplay(p: Parsed | null): string {
  if (!p) return "";
  const date = new Date(p.year, p.month - 1, p.day);
  const dateStr = date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  return `${dateStr}, ${p.hour12}:${p.minute} ${p.period}`;
}

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function DateTimePicker({ id, value, onChange, placeholder = "Select date & time" }: Props) {
  const [open, setOpen] = useState(false);
  const parsed = useMemo(() => parseValue(value), [value]);
  const now = new Date();
  const fallback: Parsed = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour12: "12",
    minute: "00",
    period: "AM",
  };
  const current = parsed ?? fallback;

  function update(patch: Partial<Parsed>) {
    onChange(toValue({ ...current, ...patch }));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !parsed && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {parsed ? formatDisplay(parsed) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Appointment Date &amp; Time</span>
          <button
            type="button"
            aria-label="Close date & time picker"
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground rounded-sm p-0.5"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex">
          <Calendar
            mode="single"
            selected={parsed ? new Date(current.year, current.month - 1, current.day) : undefined}
            onSelect={date => {
              if (!date) return;
              update({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
            }}
            className="p-2"
          />
          <div className="flex border-l">
            <TimeColumn
              label="Hr"
              values={HOURS_12}
              selected={current.hour12}
              onSelect={hour12 => update({ hour12 })}
            />
            <TimeColumn
              label="Min"
              values={MINUTES_60}
              selected={current.minute}
              onSelect={minute => update({ minute })}
            />
            <TimeColumn
              label=""
              values={["AM", "PM"]}
              selected={current.period}
              onSelect={period => update({ period: period as "AM" | "PM" })}
              scrollable={false}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TimeColumn({
  label,
  values,
  selected,
  onSelect,
  scrollable = true,
}: {
  label: string;
  values: string[];
  selected: string;
  onSelect: (v: string) => void;
  scrollable?: boolean;
}) {
  const list = (
    <div className="flex flex-col gap-0.5 p-1">
      {values.map(v => (
        <button
          key={v}
          type="button"
          onClick={() => onSelect(v)}
          className={cn(
            "rounded-md px-2.5 py-1 text-sm text-center transition-colors",
            v === selected
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted text-foreground",
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col">
      {label && (
        <div className="text-[11px] text-muted-foreground text-center pt-2 pb-0.5">{label}</div>
      )}
      {scrollable ? (
        <ScrollArea className="h-56 w-16">{list}</ScrollArea>
      ) : (
        <div className="w-16">{list}</div>
      )}
    </div>
  );
}
