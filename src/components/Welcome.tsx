import logo from '../assets/logo-white.png'
import GlassSurface from './GlassSurface'

/**
 * Tela de boas-vindas (referencia: splash do Proton Pass): a marca gigante e
 * quase apagada ao fundo sobre uma grade sutil, titulo grande em dois tons e os
 * dois pills ancorados na base — "Comecar" cheio e "Recuperar carteira existente"
 * sobre o vidro de referencia. O App.tsx a monta depois de um ciclo do loader.
 */
type WelcomeProps = {
  onRecover: () => void
  onCreate: () => void
}

export default function Welcome({ onRecover, onCreate }: WelcomeProps) {
  return (
    <section className="welcome" aria-label="Boas-vindas à Cifra">
      <div className="welcome__bg" aria-hidden="true">
        <img className="welcome__glyph" src={logo} alt="" />
        <div className="welcome__grid" />
        <div className="welcome__glow" />
      </div>
      <div className="welcome__body">
        <h1 className="welcome__title">
          <span className="welcome__title-dim">Rastro zero.</span>
          <span className="welcome__title-hi">Cifras altas.</span>
        </h1>
        <button className="welcome__cta" type="button" onClick={onCreate}>
          Começar
        </button>
        <div className="welcome__cta-shell">
          <GlassSurface className="welcome__glass" width="100%" height="100%" borderRadius={999} saturation={1.6} backgroundOpacity={0.08} />
          <button
            className="welcome__cta welcome__cta--ghost"
            type="button"
            onClick={onRecover}
          >
            Recuperar carteira existente
          </button>
        </div>
      </div>
    </section>
  )
}
