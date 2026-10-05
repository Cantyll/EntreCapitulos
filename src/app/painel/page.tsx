import type { Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AdminPage } from '@/components/admin/AdminPage';
import { ComingSoon } from '@/components/admin/ComingSoon';
import { GettingStartedSlot } from '@/components/admin/overview/GettingStartedSlot';
import styles from '@/components/admin/overview/Overview.module.css';
import { Icon, type IconName } from '@/components/ui/Icon';
import { hasRole, panelHomeFor } from '@/lib/auth/roles';
import { requireRole } from '@/lib/auth/session';

const SHORTCUTS: { href: Route; icon: IconName; label: string; text: string }[] = [
  {
    href: '/painel/sessoes',
    icon: 'list',
    label: 'Sessões',
    text: 'Escrever, publicar e editar os relatos de leitura.',
  },
  {
    href: '/painel/livros',
    icon: 'book',
    label: 'Livros',
    text: 'O livro atual, a fila, a capa e o tema do site.',
  },
  {
    href: '/painel/comentarios',
    icon: 'chat',
    label: 'Comentários',
    text: 'Aprovar, remover e restaurar os comentários das leitoras.',
  },
  {
    href: '/painel/membros',
    icon: 'users',
    label: 'Membros',
    text: 'Ver as pessoas do clube, mudar cargos e suspender comentários.',
  },
];

/** Página inicial do painel da administradora. Só traz atalhos para o que existe; o resto é "Em breve". */
export default async function OverviewPage() {
  const user = await requireRole('staff');
  // A moderadora só usa Comentários.
  if (!hasRole(user.role, 'admin')) redirect(panelHomeFor(user.role));

  return (
    <AdminPage>
      <div className={styles.stack}>
        {/* Extensão da etapa 8c: "Comece por aqui". Deve continuar como o primeiro bloco. */}
        <GettingStartedSlot />
        <p className={styles.intro}>Por onde você quer começar?</p>
        <ul className={styles.shortcuts}>
          {SHORTCUTS.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={styles.shortcut}>
                <b>
                  <Icon name={item.icon} />
                  {item.label}
                </b>
                <span>{item.text}</span>
              </Link>
            </li>
          ))}
        </ul>
        <ComingSoon title="Indicadores e atividade">
          Os números do clube, os comentários por sessão e a atividade recente ainda não existem.
        </ComingSoon>
      </div>
    </AdminPage>
  );
}
