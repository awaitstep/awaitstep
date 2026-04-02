export default function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} width="80" height="30" viewBox="0 0 80 35" fill="none">
      <rect x="0" y="0" width="52" height="10" rx="2" className="fill-primary" />
      <rect
        x="14"
        y="14"
        width="52"
        height="10"
        rx="2"
        className="fill-opacity-62 fill-primary"
        fill-opacity="0.62"
      />
      <rect
        x="28"
        y="28"
        width="52"
        height="10"
        rx="2"
        className="fill-opacity-32 fill-primary"
        fill-opacity="0.32"
      />
    </svg>
  )
}
