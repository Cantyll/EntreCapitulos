import type { Route } from 'next';
import { redirect } from 'next/navigation';

/**
 * `redirect` com caminho montado em tempo de execução. Os tipos de rota do Next só conhecem
 * rotas estáticas, e os destinos daqui já passaram por `safeNext`/`postLoginDestination`.
 */
export function redirectTo(path: string): never {
  redirect(path as Route);
}
