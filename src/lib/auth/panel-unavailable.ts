import { NextResponse } from 'next/server';

/*
 * Resposta do proxy quando ele não consegue conferir a sessão de quem abre /painel. É uma página
 * autônoma (sem layout, fontes ou CSS do app, que podem ser justamente o que está fora do ar) e
 * não diz nada técnico. Os valores de cor são os tokens padrão (`--bg`, `--ink`, `--rose-deep`).
 */
const HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#FFF8F9">
<title>Painel indisponível · Entre Capítulos</title>
<style>
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: #FFF8F9; color: #2A1E24; font: 17px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left)); box-sizing: border-box; }
  main { max-width: 30rem; }
  h1 { margin: 0 0 12px; color: #7E3350; font: 600 28px/1.2 ui-serif, Georgia, serif; }
  p { margin: 0 0 20px; }
  a { color: #7E3350; font-weight: 600; margin-right: 20px; padding: 10px 0; display: inline-block; }
  a:focus-visible { outline: 3px solid #7E3350; outline-offset: 3px; border-radius: 4px; }
</style>
</head>
<body>
<main>
<h1>Painel indisponível</h1>
<p>Não conseguimos abrir o painel agora. Tente de novo em instantes.</p>
<a href="">Tentar de novo</a><a href="/">Voltar ao início</a>
</main>
</body>
</html>
`;

export function panelUnavailableResponse(): NextResponse {
  return new NextResponse(HTML, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '30',
    },
  });
}
