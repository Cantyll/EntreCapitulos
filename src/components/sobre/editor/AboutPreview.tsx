'use client';

import { useEffect, useRef, useState } from 'react';

import { AboutView } from '@/components/sobre/AboutView';
import type { AboutContent, AboutFact } from '@/lib/about';
import {
  PREVIEW_LABELS,
  PREVIEW_WIDTHS,
  previewScale,
  type PreviewDevice,
} from '@/lib/about/preview';

import styles from './aboutEditor.module.css';

const DEVICES: PreviewDevice[] = ['phone', 'desktop'];

/*
 * A pré-visualização da página Sobre: o MESMO componente da página pública (`AboutView`), com o texto que está no
 * formulário agora (salvo ou não), numa largura de celular (390 px) ou de computador (1280 px). Quando a tela do painel
 * é mais estreita que a largura simulada, o quadro é reduzido (`transform: scale`) para caber, sem rolagem horizontal.
 * É só visual: o quadro é `inert` (nenhum link funciona nem recebe foco aqui). Aparece como visitante (com a chamada final).
 */
export function AboutPreview({
  content,
  facts,
}: {
  content: AboutContent;
  facts: readonly AboutFact[];
}) {
  const [device, setDevice] = useState<PreviewDevice>('phone');
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [frameHeight, setFrameHeight] = useState(0);
  const width = PREVIEW_WIDTHS[device];

  useEffect(() => {
    const host = hostRef.current;
    const frame = frameRef.current;
    if (!host || !frame) return;
    const measure = () => {
      setScale(previewScale(host.clientWidth, width));
      setFrameHeight(frame.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div className={styles.previewWrap} data-about-preview={device}>
      <div className={styles.previewBar}>
        <div role="group" aria-label="Tamanho da pré-visualização" className={styles.deviceToggle}>
          {DEVICES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={device === option}
              className={styles.deviceBtn}
              onClick={() => setDevice(option)}
            >
              {PREVIEW_LABELS[option]}
            </button>
          ))}
        </div>
        <p className={styles.hint}>
          Como a página aparece para quem não está logado, com o texto que está no formulário agora,
          em {width} px de largura. Só para ver: os links não funcionam aqui.
        </p>
      </div>
      <div
        ref={hostRef}
        className={styles.previewHost}
        style={{ height: frameHeight * scale }}
        data-about-preview-host=""
      >
        <div
          ref={frameRef}
          className={`${styles.previewFrame} ${device === 'phone' ? styles.previewPhone : styles.previewDesktop}`}
          style={{ width, transform: `translateX(-50%) scale(${scale})` }}
          inert
        >
          <div className={device === 'phone' ? styles.sitePhone : styles.siteDesktop}>
            <AboutView content={content} facts={facts} showCta />
          </div>
        </div>
      </div>
    </div>
  );
}
