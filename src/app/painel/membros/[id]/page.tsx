import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminPage } from '@/components/admin/AdminPage';
import { AuditList } from '@/components/membros/AuditList';
import { ContactReveal } from '@/components/membros/ContactReveal';
import { DeleteControl } from '@/components/membros/DeleteControl';
import { ExportControl } from '@/components/membros/ExportControl';
import styles from '@/components/membros/members.module.css';
import { RoleBadge, StatusPill } from '@/components/membros/RoleBadge';
import { RoleControl } from '@/components/membros/RoleControl';
import { SuspensionControl } from '@/components/membros/SuspensionControl';
import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { requireRole } from '@/lib/auth/session';
import { isUuid } from '@/lib/comments/rules';
import { MEMBER_NOTICES, parseMemberNotice } from '@/lib/members';
import {
  getDeletionImpact,
  getMemberAudit,
  getMemberProfile,
  getMemberSuspension,
} from '@/lib/members/queries';
import { ADMIN_MEMBERS_HREF } from '@/lib/routes';
import { formatFullDate } from '@/lib/site';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Membro' };

export default async function MemberProfilePage({
  params,
  searchParams,
}: PageProps<'/painel/membros/[id]'>) {
  const viewer = await requireRole('admin');

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const profile = await getMemberProfile(supabase, id);
  if (!profile) notFound();

  const notice = parseMemberNotice((await searchParams).aviso);
  const isSelf = profile.id === viewer.id;
  const isStaff = profile.role !== 'member';

  // Só o que a tela vai usar: as contagens da exclusão só para um membro que não é a própria conta.
  const [suspended, impact, audit] = await Promise.all([
    getMemberSuspension(supabase, id),
    !isSelf && !isStaff ? getDeletionImpact(supabase, id) : Promise.resolve(null),
    getMemberAudit(supabase, id),
  ]);

  return (
    <AdminPage back={{ href: ADMIN_MEMBERS_HREF, label: 'Voltar para Membros' }}>
      <div className={styles.profile}>
        {notice && (
          <p
            role="status"
            className={MEMBER_NOTICES[notice].tone === 'ok' ? styles.noticeOk : styles.noticeError}
          >
            {MEMBER_NOTICES[notice].message}
          </p>
        )}

        <section className={`${styles.card} ${styles.profileHead}`} aria-labelledby="perfil-titulo">
          <Avatar name={profile.displayName} size="lg" />
          <div>
            <h2 id="perfil-titulo" className={styles.profileName}>
              {profile.displayName}
            </h2>
            <div className={styles.profileBadges}>
              <RoleBadge role={profile.role} />
              <StatusPill suspended={isStaff ? false : suspended} />
            </div>
          </div>
          <dl className={styles.facts}>
            <dt>Entrada</dt>
            <dd>{formatFullDate(profile.createdAt)}</dd>
            <dt>Comentários aprovados</dt>
            <dd className={styles.numeric}>{profile.approvedCount}</dd>
          </dl>
        </section>

        {isSelf ? (
          <section className={`${styles.card} ${styles.section}`} aria-labelledby="propria-titulo">
            <h2 id="propria-titulo">Esta é a sua conta</h2>
            <p>
              Por segurança, você não muda o próprio cargo nem suspende ou exclui a própria conta
              por aqui, e o seu e-mail e os seus dados ficam em Minha conta. Outra pessoa da
              administração pode fazer o que for preciso.
            </p>
            <div>
              <ButtonLink href="/conta" variant="soft" size="sm">
                Abrir Minha conta
              </ButtonLink>
            </div>
          </section>
        ) : (
          <>
            <section
              className={`${styles.card} ${styles.section}`}
              aria-labelledby="contato-titulo"
            >
              <h2 id="contato-titulo">E-mail e último acesso</h2>
              <p>
                Para dar suporte e atender pedidos sobre dados pessoais. O e-mail só aparece depois
                do clique e não fica guardado nesta página.
              </p>
              <ContactReveal memberId={profile.id} />
            </section>

            <div className={styles.sectionGrid}>
              <RoleControl
                memberId={profile.id}
                name={profile.displayName}
                role={profile.role}
                suspended={suspended}
              />
              <SuspensionControl
                memberId={profile.id}
                name={profile.displayName}
                suspended={suspended}
                isStaff={isStaff}
              />
              <ExportControl memberId={profile.id} />
              <DeleteControl
                memberId={profile.id}
                name={profile.displayName}
                impact={impact ?? { comments: null, replies: null }}
                isStaff={isStaff}
              />
            </div>
          </>
        )}

        <AuditList audit={audit} />
      </div>
    </AdminPage>
  );
}
