import { useState } from 'react'
import logo from '../assets/logo-white.png'

/**
 * Barreira de instalação: fora do PWA (aba do navegador) só existe esta
 * tela. O botão abre o passo a passo; depois de adicionar à tela de
 * início, o ícone abre o app em standalone e a barreira some sozinha.
 */
export default function InstallGate() {
  const [help, setHelp] = useState(false)

  return (
    <section className="install" aria-label="Instalar a Cifra">
      <img className="install__logo" src={logo} alt="Cifra" />
      <h1 className="install__title">Cifra</h1>
      <p className="install__sub">
        Criada por amigos, para amigos.
      </p>
      <button className="welcome__cta install__cta" type="button" onClick={() => setHelp(true)}>
        Instalar aplicativo
      </button>

      {help && (
        <div className="settings-modal-overlay" onClick={() => setHelp(false)}>
          <div className="settings-modal" role="dialog" aria-label="Como instalar" onClick={(e) => e.stopPropagation()}>
            <h2 className="settings-modal-title">Como instalar</h2>
            <div className="settings-modal-text install__steps">
              <p><strong>No iPhone (Safari)</strong></p>
              <ol>
                <li>Toque em <strong>Compartilhar</strong> na barra do Safari.</li>
                <li>Toque em <strong>Adicionar à Tela de Início</strong>.</li>
                <li>Toque em <strong>Adicionar</strong> e abra o ícone Cifra.</li>
              </ol>
              <p><strong>No Android (Chrome)</strong></p>
              <ol>
                <li>Toque nos <strong>três pontos</strong> do Chrome.</li>
                <li>Toque em <strong>Adicionar à tela inicial</strong> ou <strong>Instalar aplicativo</strong>.</li>
              </ol>
            </div>
            <div className="settings-modal-actions">
              <button className="settings-modal-go" type="button" onClick={() => setHelp(false)}>
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
