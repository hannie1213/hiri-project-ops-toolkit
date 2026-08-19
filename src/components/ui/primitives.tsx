export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-[#dbe6e0] bg-white shadow-[0_10px_30px_rgba(31,72,56,0.06)] ${className}`}>{children}</div>;
}

export function CardHeader({ title, desc, right }: { title?: React.ReactNode; desc?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between border-b border-[#dbe6e0] px-5 py-4">
      <div>
        <h3 className="font-bold text-[#10291f]">{title}</h3>
        {desc && <p className="mt-0.5 text-xs leading-5 text-[#6f837b]">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  size,
  disabled,
  className = "",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const styles: Record<string, string> = {
    primary: "bg-[#117455] text-white shadow-sm hover:bg-[#0c6046]",
    secondary: "bg-white border border-[#cbded4] text-[#245c49] hover:bg-[#f0f7f3]",
    danger: "bg-red-600 text-white hover:bg-red-700",
    success: "bg-[#27815b] text-white hover:bg-[#1f6d4c]",
    ghost: "text-[#587066] hover:bg-[#e8f2ed]",
  };
  const sizeCls = size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm";
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${sizeCls} ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
  list,
  name,
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  list?: string;
  name?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      name={name}
      list={list}
      placeholder={placeholder}
      onInput={(e) => onChange?.(e.currentTarget.value)}
      className={`w-full rounded-xl border border-[#d6e2dc] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2b8768] focus:ring-2 focus:ring-[#dceee5] ${className}`}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-xl border border-[#d6e2dc] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2b8768] focus:ring-2 focus:ring-[#dceee5] ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
