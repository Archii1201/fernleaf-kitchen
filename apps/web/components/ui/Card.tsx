export function Card({
  children,
  className = '',
  hover = false,
  as: Tag = 'section',
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  as?: 'section' | 'div' | 'article' | 'li';
}) {
  return (
    <Tag
      className={`rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow)] ${hover ? 'card-hover' : ''} ${className}`}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  eyebrow,
  action,
}: {
  title: React.ReactNode;
  eyebrow?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 className="serif text-2xl font-semibold text-[var(--navy)]">{title}</h2>
      </div>
      {action}
    </div>
  );
}
