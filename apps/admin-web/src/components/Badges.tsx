import type { ReactElement } from 'react';
import type { ComplaintStatus, Priority } from '@driver-complaint/shared-types';
import { formatEnum, type SlaInfo } from '../lib/format';

/** Lifecycle status pill. Colour is a hint only — the label always carries the meaning. */
export function StatusBadge({ status }: { status: ComplaintStatus }): ReactElement {
  return <span className={`badge status-${status.toLowerCase()}`}>{formatEnum(status)}</span>;
}

/** High-visibility Priority Badge with distinct emergency/safety styling */
export function PriorityBadge({ priority }: { priority: Priority }): ReactElement {
  if (priority === 'URGENT') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          borderRadius: 6,
          backgroundColor: 'rgba(239, 68, 68, 0.18)',
          color: '#ef4444',
          border: '1px solid rgba(239, 68, 68, 0.45)',
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.04em',
        }}
        title="Critical/Urgent: Immediate action required (Accident, Breakdown, Immobilized vehicle)"
      >
        🚨 URGENT
      </span>
    );
  }

  if (priority === 'HIGH') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          borderRadius: 6,
          backgroundColor: 'rgba(249, 115, 22, 0.16)',
          color: '#f97316',
          border: '1px solid rgba(249, 115, 22, 0.4)',
          fontSize: 11,
          fontWeight: 800,
        }}
        title="High Priority: Vehicle or cargo issue needing prompt resolution"
      >
        ⚡ HIGH
      </span>
    );
  }

  if (priority === 'MEDIUM') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '3px 8px',
          borderRadius: 6,
          backgroundColor: 'rgba(2, 132, 199, 0.12)',
          color: '#0284c7',
          border: '1px solid rgba(2, 132, 199, 0.35)',
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        MEDIUM
      </span>
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 8px',
        borderRadius: 6,
        backgroundColor: 'rgba(148, 163, 184, 0.12)',
        color: 'var(--muted)',
        border: '1px solid var(--border)',
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      LOW
    </span>
  );
}

/** Operational SLA Badge */
export function SlaBadge({ sla }: { sla: SlaInfo }): ReactElement {
  if (sla.status === 'RESOLVED') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 7px',
          borderRadius: 6,
          backgroundColor: sla.isOverdue ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
          color: sla.isOverdue ? '#ef4444' : '#10b981',
          border: sla.isOverdue ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
          fontSize: 10,
          fontWeight: 700,
        }}
      >
        {sla.isOverdue ? '⚠️ ' : '✓ '} {sla.slaText}
      </span>
    );
  }

  if (sla.status === 'OVERDUE') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 7px',
          borderRadius: 6,
          backgroundColor: 'rgba(239, 68, 68, 0.18)',
          color: '#ef4444',
          border: '1px solid rgba(239, 68, 68, 0.45)',
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.02em',
        }}
        title="SLA Breached: Requires immediate escalation"
      >
        🚨 {sla.slaText}
      </span>
    );
  }

  if (sla.status === 'WARNING') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 7px',
          borderRadius: 6,
          backgroundColor: 'rgba(245, 158, 11, 0.14)',
          color: '#d97706',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          fontSize: 10,
          fontWeight: 700,
        }}
        title="Approaching SLA deadline"
      >
        ⏱️ {sla.slaText}
      </span>
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 7px',
        borderRadius: 6,
        backgroundColor: 'var(--bg)',
        color: 'var(--muted)',
        border: '1px solid var(--border)',
        fontSize: 10,
        fontWeight: 600,
      }}
    >
      ⏱️ {sla.slaText}
    </span>
  );
}
