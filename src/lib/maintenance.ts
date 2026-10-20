import { NextResponse } from 'next/server';

/*
 * Modo de manutenção (standby): com `MAINTENANCE_MODE=true` o proxy responde TODA rota com esta página e
 * nem chega a falar com o Supabase, então o banco pode estar parado, pausado ou fora do ar sem que o
 * visitante veja um erro. É uma variável de SERVIDOR (não `NEXT_PUBLIC_`): para ligar ou desligar, mude o
 * valor na Vercel e faça Redeploy (docs/operacao.md, seção 19).
 *
 * A página é autônoma, como a de `panel-unavailable.ts`: sem layout, fontes ou CSS do app. Os valores de
 * cor são os tokens padrão (`--bg`, `--ink`, `--rose-deep`). O texto não promete data de volta.
 */

/** Só o texto `true` (sem diferenciar maiúsculas nem espaços nas pontas) liga o modo. */
export function isMaintenanceMode(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

const HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#FFF8F9">
<title>Em pausa · Entre Capítulos</title>
<style>
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: #FFF8F9; color: #2A1E24; font: 17px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left)); box-sizing: border-box; }
  main { max-width: 32rem; }
  .brand { margin: 0 0 20px; color: #7B6671; font: italic 500 20px/1.2 ui-serif, Georgia, serif; }
  h1 { margin: 0 0 14px; color: #7E3350; font: 500 34px/1.15 ui-serif, Georgia, serif; }
  p { margin: 0 0 16px; }
</style>
</head>
<body>
<main>
<p class="brand">Entre Capítulos</p>
<h1>Estamos em uma pausa</h1>
<p>O clube de leitura está fora do ar por um tempo. As sessões de leitura e os comentários continuam guardados e voltam quando o site reabrir.</p>
<p>Ainda não temos uma data de volta. Obrigado por ter passado por aqui.</p>
</main>
</body>
</html>
`;

export function maintenanceResponse(): NextResponse {
  return new NextResponse(HTML, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '86400',
      'x-robots-tag': 'noindex',
    },
  });
}
