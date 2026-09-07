'use client';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useT } from './locale';
import { useId } from 'react';
export function Range({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  unit = '',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number, preview?: boolean) => void;
}) {
  const id = useId(),
    t = useT();
  label = t(label);
  return (
    <div className="parameter">
      <div>
        <label htmlFor={id}>{label}</label>
        <span>
          <input
            id={id}
            type="number"
            aria-label={label}
            min={min}
            max={max}
            step={step}
            value={Number(value.toFixed(3))}
            onChange={(e) => {
              if (e.target.value !== '')
                onChange(
                  Math.max(
                    min,
                    Math.min(
                      max,
                      min +
                        Math.round((Number(e.target.value) - min) / step) *
                          step,
                    ),
                  ),
                );
            }}
          />
          {unit}
        </span>
      </div>
      <Slider
        aria-label={`${label} slider`}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v, true)}
        onValueCommitted={(v) => onChange(Array.isArray(v) ? v[0] : v, false)}
      />
    </div>
  );
}
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const id = useId(),
    t = useT();
  label = t(label);
  return (
    <div className="choice">
      <label id={id}>{label}</label>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v !== null) onChange(v as T);
        }}
      >
        <SelectTrigger aria-labelledby={id}>
          <SelectValue>
            {options.find((o) => o.value === value)?.label &&
              t(options.find((o) => o.value === value)!.label)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {t(o.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
export function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useT();
  return (
    <label className="check-row">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v)} />
      {t(label)}
    </label>
  );
}
