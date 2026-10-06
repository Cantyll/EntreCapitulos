import type { LegalData } from '../legal-config';

/*
 * A frase da idade mínima, a MESMA em `/termos` e `/privacidade`. A idade vem de `legal-config.ts` (`minimumAge`) e é
 * uma DECLARAÇÃO da pessoa (a caixa do aceite): o site não verifica a idade, e nenhum texto pode dizer que ela foi
 * verificada ou confirmada (`tests/age-wording-static.test.ts`).
 */
export function ageSentence(config: Pick<LegalData, 'minimumAge'>): string {
  return `O clube é destinado a pessoas com ${config.minimumAge} anos ou mais. Ao aceitar os Termos de Uso e a Política de Privacidade, você declara ter essa idade. O site não verifica a idade de quem cria a conta. Se soubermos que alguém abaixo dessa idade criou uma conta, podemos excluí-la.`;
}
