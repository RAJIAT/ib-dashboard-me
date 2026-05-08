import logoUrl from "@/assets/middle-east-logo.webp";

export function Logo({ size = 44 }: { size?: number }) {
  return (
    <img
      src={logoUrl}
      alt="Middle East Insurance"
      style={{ height: size, width: "auto" }}
      className="object-contain"
    />
  );
}
