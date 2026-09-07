import logo from '../assets/logo-white.png'

/**
 * Splash loader: the Cifra mark filling up like liquid, then fading out.
 *
 * The wave is an SVG path clipped to the glyph by src/assets/logo-mask.png (see
 * scripts/gen-assets.py), so the water only ever appears inside the mark. Each
 * layer animates its own transform: the paths scroll sideways, .loader__bob
 * sloshes the surface, .loader__rise lifts the whole level from below the glyph
 * to above its top, and .loader (loader-cycle) fades everything out once full.
 */

// One full period is 50 units and the path runs 0..150, so shifting it by -50
// loops without a seam. Baselines sit at y=0 (front) / y=-5 (back) and the body
// runs down to y=200: .loader__rise then moves the surface across the measured
// glyph (y 11.5..84.5) via translateY(92px -> -2px) without ever uncovering it.
const FRONT_WAVE = 'M0 0 Q12.5 -8 25 0 T50 0 T75 0 T100 0 T125 0 T150 0 V200 H0 Z'
const BACK_WAVE = 'M0 -5 Q12.5 -13 25 -5 T50 -5 T75 -5 T100 -5 T125 -5 T150 -5 V200 H0 Z'

export default function LiquidLogo() {
  return (
    <div className="loader" role="img" aria-label="Cifra, carregando">
      <img className="loader__ghost" src={logo} alt="" width={540} height={540} />
      <svg className="loader__waves" viewBox="0 0 100 100" aria-hidden="true">
        <g className="loader__rise">
          <g className="loader__bob">
            <path className="loader__wave loader__wave--back" d={BACK_WAVE} />
            <path className="loader__wave loader__wave--front" d={FRONT_WAVE} />
          </g>
        </g>
      </svg>
    </div>
  )
}
