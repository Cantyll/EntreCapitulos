import { COVER_BUCKET, isUuid } from '@/lib/books/cover-path';

import { ABOUT_LIMITS } from './limits';

/*
 * Endereços da página Sobre: os links (só https) e a foto da autora (no bucket público `covers`, prefixo
 * `site/sobre/`). Tudo aqui trata a entrada como NÃO confiável: o navegador manda o caminho para a Server Action.
 */

/**
 * Link da lista de links: SÓ `https`, sem usuário nem senha, sem espaço, controle nem barra invertida, com host.
 * Recusa `http`, `mailto`, `javascript:`, `data:`, `//host` e caminho relativo.
 */
export function isSafeLinkUrl(url: string): boolean {
  if (url.length === 0 || url.length > ABOUT_LIMITS.linkUrl) return false;
  if (/[\u0000-\u001f\u007f\s\\]/.test(url)) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname !== '' &&
      parsed.username === '' &&
      parsed.password === '' &&
      // Começa exatamente com `https://` e um host (o parser aceita `HTTPS:host` e `https:///x`, que o banco recusa).
      url.startsWith('https://') &&
      !url.slice('https://'.length).startsWith('/')
    );
  } catch {
    return false;
  }
}

/**
 * O que a pessoa digitou no campo de link: "exemplo.com" vira "https://exemplo.com". Quem já escreveu um esquema
 * (`http:`, `javascript:`…) fica como está e é recusado por `isSafeLinkUrl`, nunca "consertado" para https.
 */
export function normalizeLinkUrl(raw: string): string {
  const value = raw.trim();
  if (value === '') return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) return value;
  return `https://${value}`;
}

export const SITE_PHOTO_FOLDER = 'site/sobre';
/**
 * Onde o NAVEGADOR deixa o arquivo enviado, antes de o servidor processá-lo. É uma pasta à parte de propósito: o
 * original (com os metadados) nunca pode ser confundido com uma foto pronta, que o conteúdo da página aceita só em
 * `site/sobre/<uuid>.webp`.
 */
export const SITE_PHOTO_INCOMING_FOLDER = `${SITE_PHOTO_FOLDER}/incoming`;

const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PHOTO_PATH = new RegExp(`^${SITE_PHOTO_FOLDER}/${UUID_SOURCE}\\.webp$`);
const UPLOAD_PATH = new RegExp(`^${SITE_PHOTO_INCOMING_FOLDER}/(${UUID_SOURCE})\\.(png|jpg|webp)$`);

/** A foto já processada, como o conteúdo a guarda: `site/sobre/<uuid>.webp`. */
export const isSitePhotoPath = (value: unknown): value is string =>
  typeof value === 'string' && PHOTO_PATH.test(value);

/** O arquivo que o NAVEGADOR enviou (antes do processamento): `site/sobre/incoming/<uuid>.<png|jpg|webp>`. */
export const isSiteUploadPath = (value: unknown): value is string =>
  typeof value === 'string' && UPLOAD_PATH.test(value);

export const sitePhotoUploadPath = (id: string, ext: 'png' | 'jpg' | 'webp'): string | null =>
  isUuid(id) ? `${SITE_PHOTO_INCOMING_FOLDER}/${id}.${ext}` : null;

/**
 * URL pública da foto, ou `null` se o caminho não for o gerado pelo servidor ou a URL do Supabase não estiver
 * configurada (a página usa então as iniciais). Só lê a variável; nunca lança.
 */
export function sitePhotoUrl(path: string | null | undefined): string | null {
  if (!isSitePhotoPath(path)) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!base) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return `${url.origin}/storage/v1/object/public/${COVER_BUCKET}/${path}`;
  } catch {
    return null;
  }
}
