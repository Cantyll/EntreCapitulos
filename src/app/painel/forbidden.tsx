import { ForbiddenNotice } from '@/components/site/ForbiddenNotice';
import { MODERATION_HREF } from '@/lib/auth/roles';

/**
 * 403 dentro do painel. Quem chega aqui já passou pelo `requireRole('staff')` do layout, então é
 * a moderadora abrindo uma página só da administradora.
 */
export default function PanelForbidden() {
  return (
    <ForbiddenNotice
      title="Esta página é só da administradora"
      actions={[
        { href: MODERATION_HREF, label: 'Ir para Comentários' },
        { href: '/', label: 'Ver o site', variant: 'ghost' },
      ]}
    >
      <p>A moderação tem acesso à fila de Comentários.</p>
    </ForbiddenNotice>
  );
}
