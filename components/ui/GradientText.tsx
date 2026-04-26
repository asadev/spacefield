export default function GradientText({ children, className = "", as: Tag = "span" }: { children: React.ReactNode; className?: string; as?: any }) {
  return <Tag className={`text-gradient ${className}`}>{children}</Tag>;
}
