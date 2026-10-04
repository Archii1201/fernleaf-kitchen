export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="slide-up mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="ornament eyebrow !text-[var(--orange-deep)]">{eyebrow}</p> : null}
        <h1 className="serif mt-1 text-4xl font-semibold leading-tight text-[var(--navy)] md:text-5xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-[var(--muted)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-end gap-3">{children}</div>;
}
