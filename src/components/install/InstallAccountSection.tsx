'use client';

import { useSyncExternalStore } from 'react';

import { isIosSafariOutsideApp, readPlatform } from '@/lib/pwa/platform';

import { InstallGuide } from './InstallGuide';

const subscribeNever = () => () => {};
const getSnapshot = () => isIosSafariOutsideApp(readPlatform(window));
// No servidor e na hidratação a seção nunca existe; o valor real entra logo depois (sem divergência).
const getServerSnapshot = () => false;

/**
 * "Instalar no iPhone", em /conta: só no Safari do iPhone ou iPad fora do app instalado, para rever os passos
 * depois de dispensar o cartão. Decide só no navegador, depois da hidratação.
 */
export function InstallAccountSection() {
  const show = useSyncExternalStore(subscribeNever, getSnapshot, getServerSnapshot);
  return show ? <InstallGuide variant="account" /> : null;
}
