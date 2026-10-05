import { AdminPage } from '@/components/admin/AdminPage';
import styles from '@/components/membros/members.module.css';
import { ButtonLink } from '@/components/ui/Button';
import { ADMIN_MEMBERS_HREF } from '@/lib/routes';

/** 404 do perfil (id que não é uuid ou pessoa que não existe mais), em português e dentro do painel. */
export default function MemberNotFound() {
  return (
    <AdminPage>
      <section
        className={`${styles.card} ${styles.section}`}
        aria-labelledby="nao-encontrada-titulo"
      >
        <h2 id="nao-encontrada-titulo">Não encontramos esta pessoa</h2>
        <p>O endereço pode estar errado, ou a conta já foi excluída.</p>
        <div>
          <ButtonLink href={ADMIN_MEMBERS_HREF} variant="soft" size="sm">
            Voltar para Membros
          </ButtonLink>
        </div>
      </section>
    </AdminPage>
  );
}
