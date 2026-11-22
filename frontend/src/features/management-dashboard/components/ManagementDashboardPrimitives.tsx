import { useId, type HTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type ManagementDashboardTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger";

export type ManagementDashboardMetricState =
  | "ready"
  | "loading"
  | "unavailable"
  | "not-applicable";

type ClassNameProps = {
  className?: string;
};

export type ManagementDashboardGridProps = ClassNameProps & {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  gap?: "compact" | "comfortable";
  label?: string;
};

/** Responsive, shared grid for management-dashboard sections and metrics. */
export function ManagementDashboardGrid({
  children,
  columns = 2,
  gap = "comfortable",
  label,
  className = "",
}: ManagementDashboardGridProps) {
  return (
    <div
      className={`md-grid md-grid-${columns} md-grid-gap-${gap} ${className}`.trim()}
      role={label ? "group" : undefined}
      aria-label={label}
    >
      {children}
    </div>
  );
}

export type ManagementDashboardSectionHeadingProps = ClassNameProps & {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

/** Consistent heading hierarchy for every management-dashboard section. */
export function ManagementDashboardSectionHeading({
  eyebrow,
  title,
  description,
  action,
  className = "",
}: ManagementDashboardSectionHeadingProps) {
  const headingId = useId();

  return (
    <header className={`md-section-heading ${className}`.trim()}>
      <div className="md-section-heading-copy">
        {eyebrow ? <p className="md-section-eyebrow">{eyebrow}</p> : null}
        <h2 id={headingId}>{title}</h2>
        {description ? <p className="md-section-description">{description}</p> : null}
      </div>
      {action ? <div className="md-section-action">{action}</div> : null}
    </header>
  );
};

export type ManagementDashboardMetricCardProps = ClassNameProps & {
  label: string;
  value: ReactNode;
  description?: string;
  context?: ReactNode;
  icon?: LucideIcon;
  tone?: ManagementDashboardTone;
  state?: ManagementDashboardMetricState;
};

/**
 * Shared KPI card. It deliberately distinguishes loading, unavailable, and
 * not-applicable values; callers must pass a genuine zero as value={0}.
 */
export function ManagementDashboardMetricCard({
  label,
  value,
  description,
  context,
  icon: Icon,
  tone = "neutral",
  state = "ready",
  className = "",
}: ManagementDashboardMetricCardProps) {
  const displayedValue =
    state === "unavailable"
      ? "Unavailable"
      : state === "not-applicable"
        ? "N/A"
        : value;

  return (
    <article
      className={`md-metric-card md-tone-${tone} ${className}`.trim()}
      aria-busy={state === "loading" ? true : undefined}
    >
      <div className="md-metric-topline">
        <span className="md-metric-label">{label}</span>
        {Icon ? (
          <span className="md-metric-icon" aria-hidden="true">
            <Icon size={17} strokeWidth={1.9} />
          </span>
        ) : null}
      </div>

      <div className="md-metric-value" aria-live="off">
        {state === "loading" ? (
          <span className="md-skeleton md-metric-value-skeleton" aria-label="Loading" />
        ) : (
          displayedValue
        )}
      </div>

      {description ? <p className="md-metric-description">{description}</p> : null}
      {context ? <div className="md-metric-context">{context}</div> : null}
    </article>
  );
}

export type ManagementDashboardMetricGridProps = ClassNameProps & {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  label?: string;
};

/** KPI-specific grid with consistent card spacing and responsive collapse. */
export function ManagementDashboardMetricGrid({
  children,
  columns = 4,
  label = "Management dashboard key performance indicators",
  className = "",
}: ManagementDashboardMetricGridProps) {
  return (
    <div
      className={`md-metric-grid md-metric-grid-${columns} ${className}`.trim()}
      aria-label={label}
    >
      {children}
    </div>
  );
}

export type ManagementDashboardPanelProps = Omit<
  HTMLAttributes<HTMLElement>,
  "title"
> & {
  heading?: string;
  eyebrow?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
};

/** Shared panel surface for summaries, tables, charts, and operational lists. */
export function ManagementDashboardPanel({
  heading,
  eyebrow,
  description,
  action,
  children,
  className = "",
  bodyClassName = "",
  ...sectionProps
}: ManagementDashboardPanelProps) {
  const headingId = useId();

  return (
    <section
      {...sectionProps}
      className={`md-panel ${className}`.trim()}
      aria-labelledby={heading ? headingId : sectionProps["aria-labelledby"]}
    >
      {heading || eyebrow || description || action ? (
        <header className="md-panel-header">
          <div className="md-panel-heading-copy">
            {eyebrow ? <p className="md-section-eyebrow">{eyebrow}</p> : null}
            {heading ? <h3 id={headingId}>{heading}</h3> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {action ? <div className="md-panel-action">{action}</div> : null}
        </header>
      ) : null}
      <div className={`md-panel-body ${bodyClassName}`.trim()}>{children}</div>
    </section>
  );
}

export type ManagementDashboardLegendItem = {
  label: string;
  tone: ManagementDashboardTone;
};

export function ManagementDashboardChartLegend({
  items,
  className = "",
}: {
  items: ManagementDashboardLegendItem[];
} & ClassNameProps) {
  if (items.length === 0) return null;

  return (
    <ul className={`md-chart-legend ${className}`.trim()} aria-label="Chart legend">
      {items.map((item) => (
        <li key={item.label}>
          <span className={`md-legend-dot md-tone-${item.tone}`} aria-hidden="true" />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

export type ManagementDashboardChartPanelProps = Omit<
  ManagementDashboardPanelProps,
  "bodyClassName"
> & {
  chartHeight?: "compact" | "standard" | "tall";
  legend?: ManagementDashboardLegendItem[];
};

/** Chart frame and accessible legend; the chart implementation is supplied as children. */
export function ManagementDashboardChartPanel({
  chartHeight = "standard",
  legend,
  className = "",
  children,
  ...props
}: ManagementDashboardChartPanelProps) {
  return (
    <ManagementDashboardPanel
      {...props}
      className={`md-chart-panel md-chart-${chartHeight} ${className}`.trim()}
      bodyClassName="md-chart-panel-body"
    >
      {children}
      {legend ? <ManagementDashboardChartLegend items={legend} /> : null}
    </ManagementDashboardPanel>
  );
}

export type ManagementDashboardFilterBarProps = ClassNameProps & {
  children: ReactNode;
  actions?: ReactNode;
  label?: string;
};

/** Layout-only filter bar; filter state and authorization stay with the parent feature. */
export function ManagementDashboardFilterBar({
  children,
  actions,
  label = "Dashboard filters",
  className = "",
}: ManagementDashboardFilterBarProps) {
  return (
    <div
      className={`md-filter-bar ${className}`.trim()}
      role="group"
      aria-label={label}
    >
      <div className="md-filter-controls">{children}</div>
      {actions ? <div className="md-filter-actions">{actions}</div> : null}
    </div>
  );
}

export type ManagementDashboardStateProps = ClassNameProps & {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
};

export function ManagementDashboardEmptyState({
  title,
  description,
  icon: Icon,
  action,
  className = "",
}: ManagementDashboardStateProps) {
  return (
    <div className={`md-state md-empty-state ${className}`.trim()} role="status">
      {Icon ? (
        <span className="md-state-icon" aria-hidden="true">
          <Icon size={19} strokeWidth={1.8} />
        </span>
      ) : null}
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="md-state-action">{action}</div> : null}
    </div>
  );
}

export function ManagementDashboardErrorState({
  title = "This section could not be loaded",
  description,
  icon: Icon,
  action,
  className = "",
}: Partial<ManagementDashboardStateProps> & { description: string }) {
  return (
    <div className={`md-state md-error-state ${className}`.trim()} role="alert">
      {Icon ? (
        <span className="md-state-icon" aria-hidden="true">
          <Icon size={19} strokeWidth={1.8} />
        </span>
      ) : null}
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="md-state-action">{action}</div> : null}
    </div>
  );
}

export type ManagementDashboardSkeletonProps = ClassNameProps & {
  variant?: "metrics" | "charts" | "list";
  count?: number;
  columns?: 2 | 3 | 4;
  label?: string;
};

/** Reusable, screen-reader-labelled loading placeholders for dashboard sections. */
export function ManagementDashboardSkeleton({
  variant = "metrics",
  count = 4,
  columns = 4,
  label = "Loading dashboard data",
  className = "",
}: ManagementDashboardSkeletonProps) {
  const safeCount = Math.min(8, Math.max(1, Math.floor(count)));

  return (
    <div
      className={`md-skeleton-region md-skeleton-${variant} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      {variant === "metrics" ? (
        <div className={`md-metric-grid md-metric-grid-${columns}`}>
          {Array.from({ length: safeCount }, (_, index) => (
            <div className="md-metric-card md-skeleton-card" key={index}>
              <span className="md-skeleton md-skeleton-label" />
              <span className="md-skeleton md-skeleton-number" />
              <span className="md-skeleton md-skeleton-caption" />
            </div>
          ))}
        </div>
      ) : variant === "charts" ? (
        <div className="md-grid md-grid-2">
          {Array.from({ length: safeCount }, (_, index) => (
            <div className="md-panel md-skeleton-chart" key={index}>
              <span className="md-skeleton md-skeleton-label" />
              <span className="md-skeleton md-skeleton-chart-area" />
            </div>
          ))}
        </div>
      ) : (
        <div className="md-panel md-skeleton-list">
          {Array.from({ length: safeCount }, (_, index) => (
            <div className="md-skeleton-list-row" key={index}>
              <span className="md-skeleton md-skeleton-avatar" />
              <span className="md-skeleton md-skeleton-list-copy" />
              <span className="md-skeleton md-skeleton-list-value" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
