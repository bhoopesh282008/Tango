// App logo: a satellite beaming down to a rescue beacon.
// Shapes are kept bold so the icon still reads at header size (32px).
// Decorative by default; pass `label` where it stands alone without the app name beside it.
export default function TangoIcon({ size = 32, animated = true, label, className = '' }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`tango-icon ${animated ? 'tango-icon--animated' : ''} ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <g className="tango-satellite">
        <rect x="26" y="5" width="12" height="11" rx="1.5" fill="#ff8800" />
        <rect x="10" y="8.5" width="14" height="4" rx="0.5" fill="#1e90ff" />
        <rect x="40" y="8.5" width="14" height="4" rx="0.5" fill="#1e90ff" />
      </g>

      <line className="tango-beam" x1="32" y1="17" x2="32" y2="39" stroke="#1e90ff" strokeWidth="3" strokeLinecap="round" />

      <circle className="tango-ring" cx="32" cy="48" r="8" fill="none" stroke="#ff6b6b" strokeWidth="2" />
      <circle className="tango-core" cx="32" cy="48" r="5.5" fill="#ff6b6b" />
      <circle cx="32" cy="48" r="2.2" fill="#ffffff" />
    </svg>
  )
}
