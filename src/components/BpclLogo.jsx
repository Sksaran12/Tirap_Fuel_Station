/**
 * BPCL dealer branding.
 *
 * NOTE: this is a hand-drawn stand-in mark, not the official artwork.
 * Replace `BpclMark` with the logo supplied in BPCL's dealer brand kit
 * before the app goes live or appears on anything the owner prints
 * for customers. The shape and colours here are approximations only.
 */

export function BpclMark({ className = 'h-8 w-8', title = 'BPCL' }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label={title}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="#FFFFFF" />
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="7.5"
        stroke="#E2E4E6"
      />
      {/* flame */}
      <path
        d="M16 5.2c3.1 3.7 6.2 6.1 6.2 10.5A6.2 6.2 0 0 1 9.8 15.7c0-2 .8-3.6 2-5"
        fill="#0B3C8C"
      />
      <path
        d="M16 12.4c1.7 2 3 3.2 3 5.3a3 3 0 1 1-6 0c0-1.4.7-2.4 1.5-3.4"
        fill="#F5B301"
      />
      <path
        d="M16 17.4c.7.8 1.2 1.3 1.2 2.2a1.2 1.2 0 1 1-2.4 0c0-.6.3-1 .7-1.4"
        fill="#FFFFFF"
      />
    </svg>
  )
}

export function BpclLockup({ className = '', station = 'Tirap Fuel Station' }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      <BpclMark className="h-9 w-9 shrink-0" />
      <span className="h-9 w-px shrink-0 bg-[#E2E4E6]" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold leading-tight tracking-[-0.01em] text-[#0D0F14]">
          {station}
        </span>
        <span className="block truncate text-[10.5px] font-medium uppercase leading-tight tracking-[0.12em] text-[#4E525A]">
          BPCL Dealer · Bharat Petroleum
        </span>
      </span>
    </div>
  )
}
