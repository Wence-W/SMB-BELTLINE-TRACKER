import { Check, ChevronDown, Search, X } from "lucide-react";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ALL_APPOINTMENT_TYPES,
  ALL_PROVIDERS,
  ALL_SERVICE_TYPES,
  CLINIC_LOCATIONS,
  PROVIDERS_BY_LOCATION,
  STATUSES,
} from "@/lib/appointmentOptions";



export interface FilterState {
  search: string;
  /** Appointment Date From / To (Gretchen, 2026-08-13). */
  dateFrom: string;
  dateTo: string;
  status: string[];
  appointmentType: string[];
  serviceType: string[];
  location: string[];
  provider: string[];
}

export const EMPTY_FILTERS: FilterState = {
  search: "",
  dateFrom: "",
  dateTo: "",
  status: [],
  appointmentType: [],
  serviceType: [],
  location: [],
  provider: [],
};

interface Props {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  // Scopes the Service Type dropdown to only the types relevant to the
  // active tab (e.g. Boost Appointments only offers Boost's own service
  // types). Defaults to the full list.
  serviceTypeOptions?: string[];
  // Scopes Appointment Type options to the active tab (e.g. Boost only
  // supports Consult). Defaults to the full list.
  appointmentTypeOptions?: string[];
}

interface MultiSelectFilterProps {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (values: string[]) => void;
  width: string;
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  width,
}: MultiSelectFilterProps) {
  function toggle(option: string) {
    onChange(
      selected.includes(option)
        ? selected.filter(value => value !== option)
        : [...selected, option],
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={`${width} justify-between font-normal`}
        >
          <span className="truncate">
            {selected.length === 0
              ? `All ${label}`
              : selected.length === 1
                ? selected[0]
                : `${selected.length} ${label} selected`}
          </span>
          <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <button
          type="button"
          onClick={() => onChange([])}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
        >
          <span className="flex size-4 shrink-0 items-center justify-center">
            {selected.length === 0 && <Check className="size-4" />}
          </span>
          All {label}
        </button>
        <div className="my-1 border-t border-border" />
        <div className="max-h-64 overflow-y-auto">
          {options.map(option => {
            const checked = selected.includes(option);
            return (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(option)}
                  aria-label={option}
                />
                <span className="min-w-0 truncate">{option}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FiltersBar({
  filters,
  onChange,
  serviceTypeOptions = ALL_SERVICE_TYPES,
  appointmentTypeOptions = ALL_APPOINTMENT_TYPES,
}: Props) {
  function patch(fields: Partial<FilterState>) {
    onChange({ ...filters, ...fields });
  }

  const providerOptions =
    filters.location.length === 0
      ? ALL_PROVIDERS
      : [...new Set(filters.location.flatMap(location => PROVIDERS_BY_LOCATION[location] ?? []))];

  const hasActiveFilters =
    filters.search ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.status.length > 0 ||
    filters.appointmentType.length > 0 ||
    filters.serviceType.length > 0 ||
    filters.location.length > 0 ||
    filters.provider.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-[180px] shrink-0">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search… (comma-separate for multiple)"
          title="Search Appointments (Patient ID, Name, Phone, Email). Separate multiple terms with a comma to match any of them."
          className="pl-8"
          value={filters.search}
          onChange={e => patch({ search: e.target.value })}
        />
      </div>

      <DateRangeFilter
        label="Appt Date"
        idPrefix="booked-filters"
        from={filters.dateFrom}
        to={filters.dateTo}
        onChange={({ from, to }) => patch({ dateFrom: from, dateTo: to })}
      />

      <MultiSelectFilter
        label="Statuses"
        options={STATUSES}
        selected={filters.status}
        onChange={status => patch({ status })}
        width="w-[150px]"
      />

      <MultiSelectFilter
        label="Appointment Types"
        options={appointmentTypeOptions}
        selected={filters.appointmentType}
        onChange={appointmentType => patch({ appointmentType })}
        width="w-[180px]"
      />

      <MultiSelectFilter
        label="Service Types"
        options={serviceTypeOptions}
        selected={filters.serviceType}
        onChange={serviceType => patch({ serviceType })}
        width="w-[180px]"
      />

      <MultiSelectFilter
        label="Clinics"
        options={CLINIC_LOCATIONS}
        selected={filters.location}
        onChange={location => {
          const nextProviders = filters.provider.filter(provider =>
            (location.length === 0 ? ALL_PROVIDERS : [...new Set(location.flatMap(l => PROVIDERS_BY_LOCATION[l] ?? []))])
              .includes(provider),
          );
          patch({ location, provider: nextProviders });
        }}
        width="w-[160px]"
      />

      <MultiSelectFilter
        label="Providers"
        options={providerOptions}
        selected={filters.provider}
        onChange={provider => patch({ provider })}
        width="w-[170px]"
      />

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
          <X className="size-3.5" />
          Clear Filters
        </Button>
      )}
    </div>
  );
}
