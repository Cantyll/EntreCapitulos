import { InstallGate } from '@/components/install/InstallGate';

/**
 * O espaço "Comece por aqui" da Visão geral: o cartão de instalação no iPhone (etapa 8e), que só aparece no Safari do
 * iOS fora do app instalado e nunca ocupa lugar nos outros aparelhos. O cartão "Quer um tour rápido?" do tutorial
 * (etapa 8k) fica no layout do painel, no topo do conteúdo, ACIMA deste espaço; enquanto ele está pendente, o cartão
 * de instalação espera (ordem: Termos, tour, instalação).
 */
export function GettingStartedSlot() {
  return <InstallGate surface="panel" />;
}
