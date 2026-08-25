import type { ReactElement } from 'react';
import type { ComplaintStatus, Priority } from '@driver-complaint/shared-types';
import { formatEnum } from '../lib/format';

/** Status pill. Colour is a hint only — the label always carries the meaning. */
export function StatusBadge({ status }: { status: ComplaintStatus }): ReactElement {
  return <span className={`badge status-${status.toLowerCase()}`}>{formatEnum(status)}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }): ReactElement {
  return <span className={`badge priority-${priority.toLowerCase()}`}>{formatEnum(priority)}</span>;
}
