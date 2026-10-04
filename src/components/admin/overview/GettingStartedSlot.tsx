import { InstallGate } from '@/components/install/InstallGate';

/**
 * PONTO DE EXTENSÃO da etapa 8c (tutorial guiado do painel): o espaço "Comece por aqui" da Visão geral. Hoje traz o
 * cartão de instalação no iPhone (etapa 8e), que só aparece no Safari do iOS fora do app instalado e nunca ocupa
 * lugar nos outros aparelhos. A 8c acrescenta o cartão e o botão que abrem o tutorial (só para a administradora)
 * ACIMA do cartão de instalação e mantém este componente como o PRIMEIRO filho de `OverviewPage`: é ali que ela o espera.
 */
export function GettingStartedSlot() {
  return <InstallGate surface="panel" />;
}
