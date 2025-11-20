export function CityEmblem({ className }: { className?: string }) {
  return (
    <svg
      width="200"
      height="200"
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Shield outline */}
      <path
        d="M100 10 L170 40 L170 100 Q170 150 100 190 Q30 150 30 100 L30 40 Z"
        fill="#DC2626"
        stroke="#991B1B"
        strokeWidth="3"
      />
      
      {/* Inner shield */}
      <path
        d="M100 25 L160 50 L160 100 Q160 140 100 175 Q40 140 40 100 L40 50 Z"
        fill="#EF4444"
        stroke="#DC2626"
        strokeWidth="2"
      />
      
      {/* Crown */}
      <g transform="translate(100, 60)">
        <rect x="-35" y="-15" width="70" height="8" fill="#FBBF24" stroke="#F59E0B" strokeWidth="1.5"/>
        <circle cx="-25" cy="-20" r="6" fill="#FBBF24" stroke="#F59E0B" strokeWidth="1.5"/>
        <circle cx="0" cy="-22" r="6" fill="#FBBF24" stroke="#F59E0B" strokeWidth="1.5"/>
        <circle cx="25" cy="-20" r="6" fill="#FBBF24" stroke="#F59E0B" strokeWidth="1.5"/>
        <path d="M-30,-15 L-30,-5 L-20,-5 L-20,-15 M-10,-15 L-10,-5 L10,-5 L10,-15 M20,-15 L20,-5 L30,-5 L30,-15" 
              fill="#FBBF24" stroke="#F59E0B" strokeWidth="1.5"/>
      </g>
      
      {/* Building/Tower */}
      <g transform="translate(100, 110)">
        <rect x="-20" y="-30" width="40" height="50" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="2"/>
        <rect x="-15" y="-25" width="10" height="10" fill="#DC2626"/>
        <rect x="5" y="-25" width="10" height="10" fill="#DC2626"/>
        <rect x="-15" y="-10" width="10" height="10" fill="#DC2626"/>
        <rect x="5" y="-10" width="10" height="10" fill="#DC2626"/>
        <rect x="-8" y="5" width="16" height="15" fill="#7C2D12"/>
      </g>
      
      {/* Decorative stars */}
      <g transform="translate(60, 90)">
        <path d="M0,-6 L1.5,-2 L6,-2 L2.5,1 L4,5 L0,2 L-4,5 L-2.5,1 L-6,-2 L-1.5,-2 Z" 
              fill="#FBBF24" stroke="#F59E0B" strokeWidth="0.5"/>
      </g>
      <g transform="translate(140, 90)">
        <path d="M0,-6 L1.5,-2 L6,-2 L2.5,1 L4,5 L0,2 L-4,5 L-2.5,1 L-6,-2 L-1.5,-2 Z" 
              fill="#FBBF24" stroke="#F59E0B" strokeWidth="0.5"/>
      </g>
    </svg>
  );
}
