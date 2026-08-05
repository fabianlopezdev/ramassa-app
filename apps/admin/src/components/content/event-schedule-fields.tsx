import { Input } from '@/components/ui/input';
import { MAX_EVENT_RECURRENCE_COUNT, MAX_EVENT_RECURRENCE_INTERVAL } from '@ramassa/shared/events';

export interface EventScheduleLabels {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly interval: string;
  readonly count: string;
}

interface EventTimeFieldsProps {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly labels: Pick<EventScheduleLabels, 'startsAt' | 'endsAt'>;
  readonly onStartsAtChange: (value: string) => void;
  readonly onEndsAtChange: (value: string) => void;
}

export type OneOffEventScheduleFieldsProps = EventTimeFieldsProps;

export function OneOffEventScheduleFields(props: OneOffEventScheduleFieldsProps) {
  return <EventTimeFields {...props} />;
}

export interface WeeklyEventScheduleFieldsProps extends EventTimeFieldsProps {
  readonly interval: number;
  readonly count: number;
  readonly labels: EventScheduleLabels;
  readonly onIntervalChange: (value: number) => void;
  readonly onCountChange: (value: number) => void;
}

export function WeeklyEventScheduleFields({
  interval,
  count,
  labels,
  onIntervalChange,
  onCountChange,
  ...timeProps
}: WeeklyEventScheduleFieldsProps) {
  return (
    <div className="flex flex-col gap-4">
      <EventTimeFields {...timeProps} labels={labels} />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{labels.interval}</span>
          <Input
            type="number"
            min={1}
            max={MAX_EVENT_RECURRENCE_INTERVAL}
            value={interval}
            data-testid="event-recurrence-interval"
            onChange={(event) => onIntervalChange(Number(event.target.value))}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{labels.count}</span>
          <Input
            type="number"
            min={1}
            max={MAX_EVENT_RECURRENCE_COUNT}
            value={count}
            data-testid="event-recurrence-count"
            onChange={(event) => onCountChange(Number(event.target.value))}
          />
        </label>
      </div>
    </div>
  );
}

function EventTimeFields({
  startsAt,
  endsAt,
  labels,
  onStartsAtChange,
  onEndsAtChange,
}: EventTimeFieldsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">{labels.startsAt}</span>
        <Input
          type="datetime-local"
          required
          value={startsAt}
          data-testid="event-starts-at"
          onChange={(event) => onStartsAtChange(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">{labels.endsAt}</span>
        <Input
          type="datetime-local"
          value={endsAt}
          data-testid="event-ends-at"
          onChange={(event) => onEndsAtChange(event.target.value)}
        />
      </label>
    </div>
  );
}
