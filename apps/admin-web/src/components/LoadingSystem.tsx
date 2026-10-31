/* ==========================================================================
   SSE Connect+ Unified Loading System (Admin Web)
   Production-grade Skeletons, Inline Spinners, and Loading Buttons
   ========================================================================== */

import React, { type ReactElement, type CSSProperties, type ButtonHTMLAttributes } from 'react';

// ---------------------------------------------------------------------------
// 1. Base Skeleton
// ---------------------------------------------------------------------------
export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: CSSProperties;
  circle?: boolean;
}

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = 6,
  className = '',
  style,
  circle = false,
}: SkeletonProps): ReactElement {
  const computedBorderRadius = circle ? '50%' : borderRadius;
  const computedWidth = circle ? (width !== '100%' ? width : height) : width;

  return (
    <div
      className={`fo-skeleton ${className}`}
      aria-hidden="true"
      style={{
        width: computedWidth,
        height,
        borderRadius: computedBorderRadius,
        ...style,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// 2. SkeletonText
// ---------------------------------------------------------------------------
export interface SkeletonTextProps {
  lines?: number;
  lineHeight?: number | string;
  gap?: number | string;
  widths?: (string | number)[];
  className?: string;
  style?: CSSProperties;
}

export function SkeletonText({
  lines = 3,
  lineHeight = 14,
  gap = 8,
  widths,
  className = '',
  style,
}: SkeletonTextProps): ReactElement {
  const defaultWidths = ['100%', '90%', '75%', '85%', '60%'];

  return (
    <div
      className={`fo-skeleton-text-group ${className}`}
      aria-hidden="true"
      style={{ display: 'flex', flexDirection: 'column', gap, ...style }}
    >
      {Array.from({ length: lines }).map((_, i) => {
        const w = widths && widths[i] !== undefined ? widths[i] : defaultWidths[i % defaultWidths.length];
        return (
          <Skeleton
            key={i}
            width={w}
            height={lineHeight}
            borderRadius={4}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. SkeletonCircle
// ---------------------------------------------------------------------------
export interface SkeletonCircleProps {
  size?: number | string;
  className?: string;
  style?: CSSProperties;
}

export function SkeletonCircle({
  size = 40,
  className = '',
  style,
}: SkeletonCircleProps): ReactElement {
  return (
    <Skeleton
      circle
      width={size}
      height={size}
      className={className}
      style={style}
    />
  );
}

// ---------------------------------------------------------------------------
// 4. SkeletonCard
// ---------------------------------------------------------------------------
export interface SkeletonCardProps {
  header?: boolean;
  lines?: number;
  footer?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: React.ReactNode;
}

export function SkeletonCard({
  header = true,
  lines = 2,
  footer = false,
  className = '',
  style,
  children,
}: SkeletonCardProps): ReactElement {
  return (
    <div className={`fo-skeleton-card ${className}`} aria-hidden="true" style={style}>
      {children ? (
        children
      ) : (
        <>
          {header && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Skeleton width="55%" height={18} borderRadius={6} />
              <Skeleton width={64} height={22} borderRadius={12} />
            </div>
          )}
          <SkeletonText lines={lines} gap={8} />
          {footer && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border, rgba(255,255,255,0.06))' }}>
              <Skeleton width={80} height={14} />
              <Skeleton width={100} height={14} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. SkeletonTable
// ---------------------------------------------------------------------------
export interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function SkeletonTable({
  rows = 5,
  columns = 6,
  showHeader = true,
  className = '',
  style,
}: SkeletonTableProps): ReactElement {
  return (
    <div className={`fo-skeleton-table-wrapper ${className}`} aria-hidden="true" style={style}>
      <table className="fo-skeleton-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        {showHeader && (
          <thead>
            <tr>
              {Array.from({ length: columns }).map((_, c) => (
                <th key={c} style={{ padding: '14px 16px', textAlign: 'left' }}>
                  <Skeleton width={c === 0 ? 30 : c === columns - 1 ? 60 : '70%'} height={12} borderRadius={4} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} style={{ borderBottom: '1px solid var(--border, rgba(255,255,255,0.05))' }}>
              {Array.from({ length: columns }).map((_, c) => (
                <td key={c} style={{ padding: '16px' }}>
                  {c === 0 ? (
                    <Skeleton width={28} height={14} borderRadius={4} />
                  ) : c === 1 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <SkeletonCircle size={28} />
                      <Skeleton width="65%" height={14} borderRadius={4} />
                    </div>
                  ) : c === columns - 1 ? (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <Skeleton width={60} height={28} borderRadius={6} />
                    </div>
                  ) : (
                    <Skeleton width={c % 2 === 0 ? '80%' : '50%'} height={14} borderRadius={4} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. InlineSpinner
// ---------------------------------------------------------------------------
export interface InlineSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}

export function InlineSpinner({
  size = 'md',
  color = 'currentColor',
  className = '',
  style,
}: InlineSpinnerProps): ReactElement {
  const pixelSize =
    typeof size === 'number'
      ? size
      : size === 'sm'
        ? 14
        : size === 'lg'
          ? 22
          : 16;

  return (
    <svg
      className={`fo-inline-spinner ${className}`}
      width={pixelSize}
      height={pixelSize}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style,
      }}
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke={color}
        strokeWidth="2.5"
        strokeOpacity="0.25"
      />
      <path
        d="M12 3C7.02944 3 3 7.02944 3 12C3 13.6826 3.46197 15.2575 4.26781 16.6067"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 7. LoadingButton
// ---------------------------------------------------------------------------
export interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  spinnerPlacement?: 'start' | 'end';
  spinnerSize?: 'sm' | 'md' | number;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
}

export function LoadingButton({
  children,
  loading = false,
  loadingText,
  spinnerPlacement = 'start',
  spinnerSize = 'md',
  disabled,
  className = '',
  style,
  onClick,
  type = 'button',
  ...rest
}: LoadingButtonProps): ReactElement {
  const isDisabled = disabled || loading;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (loading || disabled) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onClick?.(e);
  };

  return (
    <button
      {...rest}
      type={type}
      disabled={isDisabled}
      aria-busy={loading}
      onClick={handleClick}
      className={`fo-loading-btn ${loading ? 'loading' : ''} ${className}`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {loading && spinnerPlacement === 'start' && (
        <InlineSpinner size={spinnerSize} />
      )}
      <span>{loading && loadingText ? loadingText : children}</span>
      {loading && spinnerPlacement === 'end' && (
        <InlineSpinner size={spinnerSize} />
      )}
    </button>
  );
}

// ===========================================================================
// PAGE-SPECIFIC SKELETON LOADERS
// ===========================================================================

// ---------------------------------------------------------------------------
// A. DashboardPage Skeleton
// ---------------------------------------------------------------------------
export function DashboardSkeleton(): ReactElement {
  return (
    <div className="fleetops-view fo-dashboard-skeleton" aria-busy="true">
      <div className="fleetops-container" style={{ gap: 24 }}>
        {/* Mission Header Skeleton */}
        <div
          style={{
            background: 'var(--fo-surface-low, #0b1c30)',
            border: '1px solid var(--fo-border, #334155)',
            borderRadius: 14,
            padding: '24px 28px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ flex: 1 }}>
            <Skeleton width={180} height={14} style={{ marginBottom: 10 }} />
            <Skeleton width="45%" height={28} style={{ marginBottom: 8 }} />
            <Skeleton width="30%" height={14} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Skeleton width={130} height={42} borderRadius={8} />
            <Skeleton width={110} height={42} borderRadius={8} />
          </div>
        </div>

        {/* 4 KPI Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: 'var(--fo-surface, #102034)',
                border: '1px solid var(--fo-border, #334155)',
                borderRadius: 12,
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Skeleton width={100} height={14} />
                <SkeletonCircle size={24} />
              </div>
              <Skeleton width={80} height={32} borderRadius={6} />
              <Skeleton width="70%" height={12} />
            </div>
          ))}
        </div>

        {/* Category Matrix Tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: 'var(--fo-surface, #102034)',
                border: '1px solid var(--fo-border, #334155)',
                borderRadius: 10,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <SkeletonCircle size={28} />
                <Skeleton width={40} height={16} borderRadius={8} />
              </div>
              <Skeleton width="80%" height={16} />
              <Skeleton width="50%" height={12} />
              <Skeleton width="100%" height={4} borderRadius={2} />
            </div>
          ))}
        </div>

        {/* Tab & Table Section */}
        <div
          style={{
            background: 'var(--fo-surface, #102034)',
            border: '1px solid var(--fo-border, #334155)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, borderBottom: '1px solid var(--fo-border, #334155)', paddingBottom: 14 }}>
            <Skeleton width={140} height={36} borderRadius={6} />
            <Skeleton width={160} height={36} borderRadius={6} />
            <Skeleton width={150} height={36} borderRadius={6} />
          </div>
          <SkeletonTable rows={6} columns={7} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// B. ComplaintsListPage Skeleton
// ---------------------------------------------------------------------------
export function ComplaintsPageSkeleton(): ReactElement {
  return (
    <div className="fleetops-view fo-complaints-skeleton" aria-busy="true">
      <div className="fleetops-container" style={{ gap: 20 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Skeleton width={260} height={28} style={{ marginBottom: 6 }} />
            <Skeleton width={380} height={14} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Skeleton width={120} height={38} borderRadius={8} />
            <Skeleton width={100} height={38} borderRadius={8} />
          </div>
        </div>

        {/* Filter Bar */}
        <div
          style={{
            background: 'var(--fo-surface, #102034)',
            border: '1px solid var(--fo-border, #334155)',
            borderRadius: 10,
            padding: '14px 18px',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Skeleton width={280} height={36} borderRadius={6} />
          <Skeleton width={140} height={36} borderRadius={6} />
          <Skeleton width={160} height={36} borderRadius={6} />
          <Skeleton width={130} height={36} borderRadius={6} />
        </div>

        {/* Complaints Table */}
        <div
          style={{
            background: 'var(--fo-surface, #102034)',
            border: '1px solid var(--fo-border, #334155)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <SkeletonTable rows={8} columns={8} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// C. ComplaintDetailPage Skeleton
// ---------------------------------------------------------------------------
export function ComplaintDetailSkeleton(): ReactElement {
  return (
    <div className="fleetops-view fo-complaint-detail-skeleton" aria-busy="true">
      <div className="fleetops-container" style={{ gap: 20 }}>
        {/* Top Breadcrumb & Action bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Skeleton width={36} height={36} borderRadius={8} />
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <Skeleton width={120} height={22} borderRadius={6} />
                <Skeleton width={80} height={22} borderRadius={12} />
                <Skeleton width={70} height={22} borderRadius={12} />
              </div>
              <Skeleton width={260} height={14} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Skeleton width={110} height={38} borderRadius={8} />
            <Skeleton width={130} height={38} borderRadius={8} />
          </div>
        </div>

        {/* Main Grid: Left Details + Right Timeline/Evidence */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
          {/* Left: Summary, Driver Info, Vehicle, Description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                background: 'var(--fo-surface, #102034)',
                border: '1px solid var(--fo-border, #334155)',
                borderRadius: 12,
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <Skeleton width="70%" height={24} />
              <SkeletonText lines={4} gap={10} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div
                style={{
                  background: 'var(--fo-surface, #102034)',
                  border: '1px solid var(--fo-border, #334155)',
                  borderRadius: 10,
                  padding: 18,
                  display: 'flex',
                  gap: 12,
                }}
              >
                <SkeletonCircle size={44} />
                <div style={{ flex: 1 }}>
                  <Skeleton width="80%" height={16} style={{ marginBottom: 6 }} />
                  <Skeleton width="60%" height={12} />
                </div>
              </div>
              <div
                style={{
                  background: 'var(--fo-surface, #102034)',
                  border: '1px solid var(--fo-border, #334155)',
                  borderRadius: 10,
                  padding: 18,
                  display: 'flex',
                  gap: 12,
                }}
              >
                <SkeletonCircle size={44} />
                <div style={{ flex: 1 }}>
                  <Skeleton width="80%" height={16} style={{ marginBottom: 6 }} />
                  <Skeleton width="60%" height={12} />
                </div>
              </div>
            </div>

            {/* Evidence placeholders */}
            <div
              style={{
                background: 'var(--fo-surface, #102034)',
                border: '1px solid var(--fo-border, #334155)',
                borderRadius: 12,
                padding: 20,
              }}
            >
              <Skeleton width={140} height={18} style={{ marginBottom: 14 }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <Skeleton height={140} borderRadius={8} />
                <Skeleton height={140} borderRadius={8} />
                <Skeleton height={140} borderRadius={8} />
              </div>
            </div>
          </div>

          {/* Right: Timeline Audit Log */}
          <div
            style={{
              background: 'var(--fo-surface, #102034)',
              border: '1px solid var(--fo-border, #334155)',
              borderRadius: 12,
              padding: 24,
            }}
          >
            <Skeleton width={160} height={20} style={{ marginBottom: 20 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: 14 }}>
                  <SkeletonCircle size={32} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Skeleton width={120} height={14} />
                      <Skeleton width={70} height={12} />
                    </div>
                    <Skeleton width="90%" height={13} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// D. VehiclesPage Skeleton
// ---------------------------------------------------------------------------
export function VehiclesPageSkeleton(): ReactElement {
  return (
    <div className="fleetops-view fo-vehicles-skeleton" aria-busy="true">
      <div className="fleetops-container" style={{ gap: 20 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Skeleton width={240} height={28} style={{ marginBottom: 6 }} />
            <Skeleton width={320} height={14} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Skeleton width={140} height={38} borderRadius={8} />
            <Skeleton width={110} height={38} borderRadius={8} />
          </div>
        </div>

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: 'var(--fo-surface, #102034)',
                border: '1px solid var(--fo-border, #334155)',
                borderRadius: 10,
                padding: 16,
              }}
            >
              <Skeleton width={90} height={12} style={{ marginBottom: 8 }} />
              <Skeleton width={60} height={28} borderRadius={4} />
            </div>
          ))}
        </div>

        {/* Vehicles Table */}
        <div
          style={{
            background: 'var(--fo-surface, #102034)',
            border: '1px solid var(--fo-border, #334155)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <SkeletonTable rows={8} columns={7} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// E. UsersPage Skeleton
// ---------------------------------------------------------------------------
export function UsersPageSkeleton(): ReactElement {
  return (
    <div className="fleetops-view fo-users-skeleton" aria-busy="true">
      <div className="fleetops-container" style={{ gap: 20 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Skeleton width={220} height={28} style={{ marginBottom: 6 }} />
            <Skeleton width={340} height={14} />
          </div>
          <Skeleton width={130} height={38} borderRadius={8} />
        </div>

        {/* Pending Approvals Section Placeholder */}
        <div
          style={{
            background: 'var(--fo-surface, #102034)',
            border: '1px solid var(--fo-border, #334155)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <Skeleton width={180} height={18} style={{ marginBottom: 14 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                style={{
                  border: '1px solid var(--fo-border, #334155)',
                  borderRadius: 10,
                  padding: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <SkeletonCircle size={40} />
                  <div>
                    <Skeleton width={120} height={16} style={{ marginBottom: 6 }} />
                    <Skeleton width={80} height={12} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Skeleton width={70} height={30} borderRadius={6} />
                  <Skeleton width={70} height={30} borderRadius={6} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Directory Table */}
        <div
          style={{
            background: 'var(--fo-surface, #102034)',
            border: '1px solid var(--fo-border, #334155)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <SkeletonTable rows={7} columns={6} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// F. Generic Data-Driven Page Skeleton (Loading, Trips, Maintenance, Spare Parts)
// ---------------------------------------------------------------------------
export function PageModuleSkeleton({
  title = 'Telemetry & Operations',
  subtitle = 'Synchronizing fleet records and telemetry streams…',
  statCardsCount = 4,
  tableColumns = 7,
  tableRows = 7,
}: {
  title?: string;
  subtitle?: string;
  statCardsCount?: number;
  tableColumns?: number;
  tableRows?: number;
}): ReactElement {
  return (
    <div className="fleetops-view fo-generic-skeleton" aria-busy="true">
      <div className="fleetops-container" style={{ gap: 20 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="fo-page-main-heading" style={{ margin: '0 0 6px 0', fontSize: 24, fontWeight: 700 }}>
              {title}
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--fo-text-muted, #8c909f)' }}>{subtitle}</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Skeleton width={110} height={38} borderRadius={8} />
            <Skeleton width={90} height={38} borderRadius={8} />
          </div>
        </div>

        {/* Metric Cards */}
        {statCardsCount > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fit, minmax(${statCardsCount > 3 ? '220px' : '260px'}, 1fr))`,
              gap: 14,
            }}
          >
            {Array.from({ length: statCardsCount }).map((_, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--fo-surface, #102034)',
                  border: '1px solid var(--fo-border, #334155)',
                  borderRadius: 10,
                  padding: '16px 20px',
                }}
              >
                <Skeleton width="60%" height={12} style={{ marginBottom: 10 }} />
                <Skeleton width="40%" height={28} borderRadius={4} />
              </div>
            ))}
          </div>
        )}

        {/* Data Container */}
        <div
          style={{
            background: 'var(--fo-surface, #102034)',
            border: '1px solid var(--fo-border, #334155)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <Skeleton width={240} height={36} borderRadius={6} />
            <Skeleton width={140} height={36} borderRadius={6} />
          </div>
          <SkeletonTable rows={tableRows} columns={tableColumns} />
        </div>
      </div>
    </div>
  );
}

