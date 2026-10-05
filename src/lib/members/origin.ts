/*
 * Defesa em profundidade do download por POST (o cookie já é SameSite=Lax, que não vai em POST de outro site):
 * a requisição precisa vir do próprio site. Função pura, com os cabeçalhos já lidos.
 */
export type OriginHeaders = {
  origin: string | null;
  host: string | null;
  forwardedHost: string | null;
  secFetchSite: string | null;
};

/**
 * `Origin` presente e com o mesmo host da requisição (`x-forwarded-host` antes de `host`, como atrás da Vercel).
 * `Sec-Fetch-Site`, quando o navegador manda, precisa ser `same-origin`. Sem `Origin`: recusa (todo navegador
 * moderno manda `Origin` em POST).
 */
export function isSameOrigin(headers: OriginHeaders): boolean {
  if (headers.secFetchSite !== null && headers.secFetchSite !== 'same-origin') return false;
  if (!headers.origin) return false;

  let origin: URL;
  try {
    origin = new URL(headers.origin);
  } catch {
    return false;
  }
  if (origin.protocol !== 'https:' && origin.protocol !== 'http:') return false;

  const host = (headers.forwardedHost ?? headers.host ?? '').split(',')[0]?.trim().toLowerCase();
  return host !== undefined && host !== '' && origin.host.toLowerCase() === host;
}

export function readOriginHeaders(headers: Headers): OriginHeaders {
  return {
    origin: headers.get('origin'),
    host: headers.get('host'),
    forwardedHost: headers.get('x-forwarded-host'),
    secFetchSite: headers.get('sec-fetch-site'),
  };
}
