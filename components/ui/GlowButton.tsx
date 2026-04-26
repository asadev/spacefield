import Link from "next/link";

interface GlowButtonProps {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "outline";
  className?: string;
}

export default function GlowButton({ href, children, variant = "primary", className = "" }: GlowButtonProps) {
  const base = "relative inline-flex items-center justify-center gap-2 rounded-lg px-8 py-4 text-sm font-semibold transition-all duration-300";
  const variants = {
    primary: "btn-primary",
    outline: "btn-outline",
  };

  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}
