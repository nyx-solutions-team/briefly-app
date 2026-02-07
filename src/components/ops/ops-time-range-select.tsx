"use client";

import { CalendarRange } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOpsFilters } from './ops-filters-context';

const TIME_RANGE_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

export default function OpsTimeRangeSelect() {
  const { timeRange, setTimeRange } = useOpsFilters();

  return (
    <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
      <CalendarRange className="h-4 w-4 text-muted-foreground" />
      <Select value={timeRange} onValueChange={(val) => setTimeRange(val as typeof timeRange)}>
        <SelectTrigger className="h-6 border-none px-0 focus:ring-0">
          <SelectValue placeholder="Select range" />
        </SelectTrigger>
        <SelectContent align="end">
          {TIME_RANGE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
