// Admin → Dropdown lists. In the original these were edited from "Manage"
// buttons inside the Cases, Piedmont and Booked Tracker forms; those inline
// buttons return with their modules (Phases 3–5). Until then admins manage the
// lists here. Server-enforced: admin only.
import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/errors";

const LISTS = [
  { list: "precertProviders", title: "Pre-Cert Provider" },
  { list: "reverificationRequesters", title: "Reverification “Request by”" },
  { list: "piedmontEpicProviders", title: "Piedmont: Epic “To Provider”" },
] as const;
const LOCATIONS = ["Atlanta", "Stockbridge", "Newnan"] as const;

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (value: string) => Promise<unknown> }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex gap-2 pt-2"
      onSubmit={async e => {
        e.preventDefault();
        try {
          await onAdd(value);
          setValue("");
        } catch (err) {
          toast.error(errorMessage(err, "Failed to add"));
        }
      }}
    >
      <Input value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} className="h-8 text-sm" />
      <Button type="submit" size="sm">
        Add
      </Button>
    </form>
  );
}

function SimpleList({ list, title }: (typeof LISTS)[number]) {
  const rows = useQuery(api.managedLists.list, { list });
  const add = useMutation(api.managedLists.add);
  const remove = useMutation(api.managedLists.remove);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border text-sm">
          {(rows ?? []).map(row => (
            <li key={row._id} className="flex items-center justify-between py-1.5">
              {row.name}
              <button
                type="button"
                aria-label={`Remove ${row.name}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={() =>
                  void remove({ list, id: row._id }).catch(err => toast.error(errorMessage(err, "Failed to remove")))
                }
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <AddRow placeholder="Add a name" onAdd={name => add({ list, name })} />
      </CardContent>
    </Card>
  );
}

function OptionList({
  title,
  values,
  onAdd,
  onRemove,
}: {
  title: string;
  values: string[];
  onAdd: (v: string) => Promise<unknown>;
  onRemove: (v: string) => Promise<unknown>;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="divide-y divide-border text-sm">
        {values.map(value => (
          <li key={value} className="flex items-center justify-between py-1.5">
            {value}
            <button
              type="button"
              aria-label={`Remove ${value}`}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => void onRemove(value).catch(err => toast.error(errorMessage(err, "Failed to remove")))}
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <AddRow placeholder="Add a choice" onAdd={onAdd} />
    </div>
  );
}

function AppointmentOptions() {
  const options = useQuery(api.appointmentOptions.list);
  const add = useMutation(api.appointmentOptions.add);
  const remove = useMutation(api.appointmentOptions.remove);
  if (!options) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Booked Tracker Scheduler and Provider choices</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        <OptionList
          title="Scheduler"
          values={options.schedulers}
          onAdd={value => add({ optionType: "scheduler", value })}
          onRemove={value => remove({ optionType: "scheduler", value })}
        />
        {LOCATIONS.map(location => (
          <OptionList
            key={location}
            title={`Providers: ${location}`}
            values={options.providersByLocation[location]}
            onAdd={value => add({ optionType: "provider", value, location })}
            onRemove={value => remove({ optionType: "provider", value, location })}
          />
        ))}
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Removing a choice only hides it from the form; saved appointments keep their value.
        </p>
      </CardContent>
    </Card>
  );
}

export function ListsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Dropdown lists</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {LISTS.map(l => (
          <SimpleList key={l.list} {...l} />
        ))}
      </div>
      <AppointmentOptions />
    </div>
  );
}
