'use client';

import '@/styles/tokens.css';
import '@/styles/base.css';

/**
 * Última rede: roda quando o próprio layout raiz falha. Substitui o <html>, então precisa dos dois
 * elementos e não conta com fontes nem com o tema da capa (só com os tokens padrão). Texto em português,
 * sem nenhum detalhe técnico.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body>
        <main
          style={{
            minHeight: '100dvh',
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div style={{ maxWidth: 440 }}>
            <h1 style={{ fontSize: 28, margin: '0 0 12px' }}>Algo deu errado por aqui</h1>
            <p style={{ margin: '0 0 20px', color: 'var(--ink-2)' }}>
              Não conseguimos carregar o site agora. Tente de novo em instantes.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                minHeight: 44,
                padding: '10px 22px',
                border: 0,
                borderRadius: 999,
                background: 'var(--rose-2)',
                color: '#fff',
                fontWeight: 500,
                fontSize: 15,
              }}
            >
              Tentar de novo
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
