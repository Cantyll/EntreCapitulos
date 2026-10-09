'use client';

import { useEffect, useId, useRef } from 'react';

import {
  arrowPath,
  circlePath,
  markKind,
  seededRng,
  seedFrom,
  underlinePath,
} from '@/lib/about/pencil';

import styles from './pencil.module.css';

/*
 * As anotações a lápis da página Sobre: uma camada SVG por cima do conteúdo (`aria-hidden`, sem eventos de ponteiro)
 * que desenha à mão o que está marcado com `data-pencil` dentro do mesmo `[data-about-root]`:
 *
 * - `underline`: sublinha cada linha do texto (`data-pencil-lines="last"`: só a última);
 * - `circle`: circula a caixa;
 * - `auto`: o negrito do texto (`markKind`: curto ganha círculo, longo ganha sublinhado);
 * - `mark`: o itálico vira marca-texto (só CSS; aqui só ganha o `data-drawn`);
 * - `arrow`: seta do elemento até o retrato (`data-pencil-to`, um seletor dentro da raiz).
 *
 * Cada traço se desenha quando o trecho aparece na tela (conferido a cada rolagem), uma vez só. Os caminhos são refeitos
 * quando a raiz muda de tamanho, e o que já foi desenhado volta desenhado, sem animar de novo. Tudo é DOM direto (nada
 * de estado do React): a camada não muda o HTML do conteúdo e o texto continua o mesmo para o leitor de tela. Sem
 * JavaScript, a página é a mesma de antes, sem os traços.
 *
 * Funciona também dentro da pré-visualização do painel, que mostra a página reduzida com `transform: scale`: as
 * medidas são divididas pela escala.
 */
type Target = { el: HTMLElement; kind: string; key: string };

const SVG_NS = 'http://www.w3.org/2000/svg';

export function PencilMarks() {
  const svgRef = useRef<SVGSVGElement>(null);
  const filterId = `lapis-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;

  useEffect(() => {
    const svg = svgRef.current;
    const root = svg?.closest<HTMLElement>('[data-about-root]');
    const layer = svg?.querySelector<SVGGElement>('[data-pencil-layer]');
    if (!svg || !root || !layer) return;

    // Quando cada traço começou a ser desenhado. Um redesenho (a fonte chegou, a tela girou) no meio da animação
    // continua a animação de onde o tempo está; depois de terminada, o traço volta pronto, sem animar de novo.
    const drawn = new Map<string, number>();
    const SETTLED_MS = 3000;
    let targets: Target[] = [];
    let frame = 0;

    const collect = () => {
      const seen = new Map<string, number>();
      targets = [...root.querySelectorAll<HTMLElement>('[data-pencil]')].map((el) => {
        const kind = el.dataset.pencil ?? '';
        // A chave identifica o trecho entre um redesenho e outro (texto + ordem), para lembrar o que já foi desenhado.
        const base = `${kind}:${el.textContent ?? ''}`;
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        return { el, kind, key: `${base}#${n}` };
      });
    };

    const lineRects = (el: HTMLElement): DOMRect[] => {
      const range = document.createRange();
      range.selectNodeContents(el);
      // Junta os pedaços da mesma linha (cada palavra do título é um `inline-block` e vira um retângulo próprio).
      const lines: DOMRect[] = [];
      for (const r of range.getClientRects()) {
        if (r.width <= 1 || r.height <= 1) continue;
        const same = lines.find((l) => Math.abs(l.bottom - r.bottom) < r.height / 2);
        if (!same) {
          lines.push(DOMRect.fromRect(r));
          continue;
        }
        const left = Math.min(same.left, r.left);
        const right = Math.max(same.right, r.right);
        same.x = left;
        same.width = right - left;
      }
      return lines;
    };

    const build = () => {
      const box = root.getBoundingClientRect();
      const scale = root.offsetWidth > 0 ? box.width / root.offsetWidth : 1;
      const x = (v: number) => (v - box.left) / scale;
      const y = (v: number) => (v - box.top) / scale;

      layer.replaceChildren();
      const pending: SVGGElement[] = [];
      for (const target of targets) {
        const { el, key } = target;
        const kind = target.kind === 'auto' ? markKind(el.textContent ?? '') : target.kind;
        const rng = seededRng(seedFrom(key));
        const delay = Number(el.dataset.pencilDelay ?? 0) || 0;
        const paths: { d: string; ms: number; wait: number }[] = [];

        if (kind === 'underline') {
          let rects = lineRects(el);
          if (el.dataset.pencilLines === 'last') rects = rects.slice(-1);
          rects.forEach((r, i) => {
            const w = r.width / scale;
            paths.push({
              d: underlinePath(x(r.left), y(r.bottom) - 1, w, rng),
              ms: Math.min(900, 380 + w * 1.4),
              wait: delay + i * 260,
            });
          });
        } else if (kind === 'circle') {
          const r = el.getBoundingClientRect();
          if (r.width > 0) {
            const w = r.width / scale;
            const h = r.height / scale;
            paths.push({
              d: circlePath(x(r.left) + w / 2, y(r.top) + h / 2, w / 2 + 7, h / 2 + 5, rng),
              ms: 720,
              wait: delay,
            });
          }
        } else if (kind === 'arrow') {
          const to = root.querySelector<HTMLElement>(el.dataset.pencilTo ?? '');
          const first = lineRects(el)[0];
          const t = to?.getBoundingClientRect();
          if (first && t && t.width > 0) {
            const from: [number, number] = [x(first.left) - 10, y(first.top) + 4];
            const end: [number, number] = [x(t.left) - 10, y(t.top + t.height * 0.55)];
            paths.push({ d: arrowPath(from, end, -0.42, rng), ms: 820, wait: delay });
          }
        }

        if (paths.length === 0) continue;
        const group = document.createElementNS(SVG_NS, 'g');
        group.dataset.key = key;
        for (const p of paths) {
          const path = document.createElementNS(SVG_NS, 'path');
          path.setAttribute('d', p.d);
          path.setAttribute('pathLength', '1');
          path.style.setProperty('--ms', `${Math.round(p.ms)}ms`);
          path.style.setProperty('--wait', `${Math.round(p.wait)}ms`);
          group.append(path);
        }
        layer.append(group);
        const started = drawn.get(key);
        if (started === undefined) continue;
        const elapsed = performance.now() - started;
        if (elapsed > SETTLED_MS) {
          group.dataset.instant = '';
          group.dataset.drawn = '';
        } else {
          paths.forEach((p, i) => {
            group.children[i]?.setAttribute(
              'style',
              `--ms: ${Math.round(p.ms)}ms; --wait: ${Math.max(0, Math.round(p.wait - elapsed))}ms`,
            );
          });
          pending.push(group);
        }
      }
      // O traço novo precisa ser pintado "apagado" antes de ganhar `data-drawn`, senão não há transição.
      if (pending.length > 0) {
        void layer.getBoundingClientRect();
        for (const g of pending) g.dataset.drawn = '';
      }
    };

    const markDrawn = (target: Target) => {
      if (drawn.has(target.key)) return;
      drawn.set(target.key, performance.now());
      target.el.dataset.drawn = '';
      const group = [...layer.children].find(
        (g) => g instanceof SVGGElement && g.dataset.key === target.key,
      ) as SVGGElement | undefined;
      if (group) group.dataset.drawn = '';
    };

    // Um traço se desenha quando o topo do trecho passa de 88% da altura da janela, inclusive quando a rolagem pulou
    // por cima dele (ir direto ao fim da página não deixa traço para trás). Conferir a posição a cada rolagem é mais
    // previsível que um IntersectionObserver com limiar: o WebKit às vezes não avisa de um trecho que passou depressa.
    let check = 0;
    const reveal = () => {
      cancelAnimationFrame(check);
      check = requestAnimationFrame(() => {
        const limit = window.innerHeight * 0.88;
        for (const t of targets) {
          if (!drawn.has(t.key) && t.el.getBoundingClientRect().top < limit) markDrawn(t);
        }
      });
    };
    // Captura: também ouve a rolagem de contêineres (a pré-visualização do painel).
    window.addEventListener('scroll', reveal, { capture: true, passive: true });
    window.addEventListener('resize', reveal, { passive: true });

    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        collect();
        build();
        for (const t of targets) {
          if (drawn.has(t.key)) t.el.dataset.drawn = '';
        }
        reveal();
      });
    };

    refresh();
    // A fonte da serifa pode chegar depois: as linhas mudam de lugar e os traços precisam acompanhar.
    void document.fonts?.ready.then(refresh);
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(refresh) : null;
    resize?.observe(root);
    // A pré-visualização do painel troca o texto sem mudar o tamanho da raiz.
    const mutations = new MutationObserver((records) => {
      if (records.some((r) => !svg.contains(r.target))) refresh();
    });
    mutations.observe(root, { subtree: true, childList: true, characterData: true });

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(check);
      window.removeEventListener('scroll', reveal, { capture: true });
      window.removeEventListener('resize', reveal);
      resize?.disconnect();
      mutations.disconnect();
    };
  }, []);

  return (
    <svg ref={svgRef} className={styles.layer} aria-hidden="true" focusable="false">
      <defs>
        {/* Grão de grafite: o traço treme um pouquinho, como lápis no papel. */}
        <filter id={filterId} x="-5%" y="-20%" width="110%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves="2"
            seed="7"
            result="grain"
          />
          <feDisplacementMap in="SourceGraphic" in2="grain" scale="1.6" />
        </filter>
      </defs>
      <g data-pencil-layer="" filter={`url(#${filterId})`} />
    </svg>
  );
}
