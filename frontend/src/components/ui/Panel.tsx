import type { HTMLAttributes, ReactNode } from "react";

export function Panel({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`panel ${className}`.trim()}>{children}</div>;
}

export function PanelHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="panel-heading">
      <div className="min-w-0">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="panel-heading-action">{action}</div> : null}
    </div>
  );
}
