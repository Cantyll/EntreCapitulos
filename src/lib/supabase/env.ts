/*
 * Variáveis públicas do Supabase. As referências a `process.env.NEXT_PUBLIC_*` precisam ser
 * literais para o Next trocá-las no bundle do navegador. A leitura é feita só quando o cliente é
 * criado (e não ao importar o módulo), para o `next build` passar sem `.env`.
 */
export function getSupabaseEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      'Faltam NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Veja o .env.example.',
    );
  }

  return { url, publishableKey };
}
