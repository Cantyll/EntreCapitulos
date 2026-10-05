import { ROLE_LABELS } from '@/lib/auth/roles';

import styles from './members.module.css';

/** "Cargos e permissões": o que cada cargo faz, em texto fixo (nada de número ou nome de exemplo). */
export function RolesCard() {
  return (
    <aside
      className={`${styles.card} ${styles.roles}`}
      aria-labelledby="cargos-titulo"
      data-tour="members-roles-card"
    >
      <h2 id="cargos-titulo">Cargos e permissões</h2>
      <dl>
        <div>
          <dt>{ROLE_LABELS.admin}</dt>
          <dd>
            Abre todo o painel (livros, sessões, comentários e membros) e pode mudar cargos,
            suspender comentários e excluir contas.
          </dd>
        </div>
        <div>
          <dt>{ROLE_LABELS.moderator}</dt>
          <dd>
            Abre só Comentários e Minha conta. Aprova, remove e restaura comentários; os comentários
            dela são publicados direto.
          </dd>
        </div>
        <div>
          <dt>{ROLE_LABELS.member}</dt>
          <dd>
            Lê e comenta com as regras da moderação (os 3 primeiros comentários e os que têm link
            esperam aprovação) e usa Minha conta.
          </dd>
        </div>
      </dl>
      <p>
        O cargo e a suspensão valem na próxima página ou ação da pessoa. A lista mostra o e-mail
        mascarado; o e-mail completo só aparece no perfil, e cada consulta fica registrada.
      </p>
    </aside>
  );
}
