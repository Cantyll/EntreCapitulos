'use client';

import { useEffect, useRef } from 'react';

import {
  PEN,
  arrowPath,
  circlePath,
  markKind,
  seededRng,
  seedFrom,
  strokeMs,
  underlinePath,
} from '@/lib/about/pencil';

import styles from './pencil.module.css';

/*
 * As anotações a lápis da página Sobre. Escreve o título (as palavras de `[data-pen-word]`, ver `about.module.css`) e
 * depois desenha, numa camada SVG por cima do conteúdo (`aria-hidden`, sem eventos de ponteiro), o que está marcado
 * com `data-pencil` dentro do mesmo `[data-about-root]`:
 *
 * - `underline`: sublinha cada linha do texto (`data-pencil-lines="last"`: só a última);
 * - `circle`: circula a caixa;
 * - `auto`: o negrito do texto (`markKind`: curto ganha círculo, longo ganha sublinhado);
 * - `mark`: o itálico vira marca-texto (o fundo é CSS; aqui só a passada);
 * - `arrow`: seta do elemento até o retrato (`data-pencil-to`, um seletor dentro da raiz).
 *
 * Uma mão só: nada começa no carregamento. Primeiro a página precisa estar sendo desenhada (a fonte chegou e os
 * quadros saem no tempo), senão a animação corre escondida e a pessoa só vê o salto (o que acontecia no Safari do
 * iPhone). Então o título se escreve e, depois dele, os traços entram numa fila, um por vez, na ordem da leitura,
 * conforme cada trecho chega a 88% da altura da janela. Um trecho que a rolagem já deixou para trás quando chega a
 * vez dele aparece pronto, sem animar (ninguém o veria). Tudo é Web Animations, sem transição de CSS: o Safari não
 * animava o traço que ganhava `data-drawn` logo depois de entrar na página. O título anima só `transform` (roda no
 * compositor); o traço anima o `stroke-dashoffset` com o comprimento real do caminho (`getTotalLength`).
 *
 * Os caminhos são refeitos quando a raiz muda de tamanho, a fonte chega ou o texto muda (pré-visualização do painel,
 * que mostra a página reduzida com `transform: scale`: as medidas são divididas pela escala); o que já foi desenhado
 * volta pronto. Tudo é DOM direto (nada de estado do React). Sem JavaScript, o título aparece pela animação de
 * reserva do CSS e não há traços; com menos movimento, tudo aparece pronto.
 */
type Kind = 'underline' | 'circle' | 'arrow' | 'mark';
type Target = { el: HTMLElement; kind: Kind; key: string };
type Stroke = { path: SVGPathElement; length: number; ms: number };

const SVG_NS = 'http://www.w3.org/2000/svg';
/** A mão acelera no começo do traço e assenta no fim. */
const STROKE_EASE = 'cubic-bezier(0.45, 0.05, 0.35, 1)';
/** A escrita do título anda quase constante, como quem escreve. */
const WRITE_EASE = 'cubic-bezier(0.3, 0.1, 0.6, 1)';
/** Onde o topo de um trecho precisa chegar, em fração da altura da janela, para entrar na fila. */
const REVEAL_AT = 0.88;

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Espera a página estar sendo desenhada: a fonte chegou (ou 1,5 s) e dois quadros seguidos saíram no tempo (ou 1 s). */
async function whenPainting(alive: () => boolean): Promise<void> {
  await Promise.race([document.fonts?.ready ?? Promise.resolve(), sleep(1500)]);
  const start = performance.now();
  let last = await nextFrame();
  let smooth = 0;
  while (smooth < 2 && performance.now() - start < 1000 && alive()) {
    const now = await nextFrame();
    smooth = now - last < 25 ? smooth + 1 : 0;
    last = now;
  }
}

/** Espera uma animação terminar; cancelada (a camada foi refeita, a página saiu) conta como terminada. */
const settled = (animation: Animation) =>
  animation.finished.then(
    () => undefined,
    () => undefined,
  );

export function PencilMarks() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const root = svg?.closest<HTMLElement>('[data-about-root]');
    const layer = svg?.querySelector<SVGGElement>('[data-pencil-layer]');
    if (!svg || !root || !layer) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let alive = true;
    // `drawn`: o traço já começou (ou terminou); um redesenho o devolve pronto. `queued`: esperando a vez na fila.
    const drawn = new Set<string>();
    const queued: string[] = [];
    const running = new Set<Animation>();
    let targets: Target[] = [];
    let strokes = new Map<string, Stroke[]>();
    let ready = false;
    let pumping = false;
    let titleDone: Promise<void> = Promise.resolve();
    let frame = 0;
    let check = 0;

    const play = async (animation: Animation) => {
      running.add(animation);
      await settled(animation);
      running.delete(animation);
    };

    const collect = () => {
      const seen = new Map<string, number>();
      targets = [...root.querySelectorAll<HTMLElement>('[data-pencil]')].flatMap((el) => {
        const raw = el.dataset.pencil ?? '';
        const kind = raw === 'auto' ? markKind(el.textContent ?? '') : raw;
        if (kind !== 'underline' && kind !== 'circle' && kind !== 'arrow' && kind !== 'mark') {
          return [];
        }
        // A chave identifica o trecho entre um redesenho e outro (texto + ordem), para lembrar o que já foi desenhado.
        const base = `${raw}:${el.textContent ?? ''}`;
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        return [{ el, kind, key: `${base}#${n}` }];
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

    const show = (stroke: Stroke) => {
      stroke.path.style.strokeDasharray = '';
      stroke.path.style.strokeDashoffset = '';
    };

    const hide = (stroke: Stroke) => {
      // O vão é maior que o traço e o deslocamento passa um pouco do início: a ponta redonda não deixa um pingo.
      stroke.path.style.strokeDasharray = `${stroke.length} ${stroke.length + 4}`;
      stroke.path.style.strokeDashoffset = `${stroke.length + 2}`;
    };

    const build = () => {
      // A animação em curso fica num caminho que vai sair do DOM; o trecho dela volta pronto (já está em `drawn`).
      for (const animation of running) {
        if (
          animation.effect instanceof KeyframeEffect &&
          animation.effect.target instanceof SVGElement
        ) {
          animation.cancel();
        }
      }
      // Mede o título como ele fica no fim da escrita (as palavras ainda podem estar deslocadas).
      root.setAttribute('data-pen-measure', '');
      const box = root.getBoundingClientRect();
      const scale = root.offsetWidth > 0 ? box.width / root.offsetWidth : 1;
      const x = (v: number) => (v - box.left) / scale;
      const y = (v: number) => (v - box.top) / scale;

      const shapes = new Map<string, { d: string; ms: number }[]>();
      for (const { el, kind, key } of targets) {
        const rng = seededRng(seedFrom(key));
        const paths: { d: string; ms: number }[] = [];
        if (kind === 'underline') {
          let rects = lineRects(el);
          if (el.dataset.pencilLines === 'last') rects = rects.slice(-1);
          for (const r of rects) {
            const w = r.width / scale;
            paths.push({
              d: underlinePath(x(r.left), y(r.bottom) - 1, w, rng),
              ms: strokeMs('underline', w),
            });
          }
        } else if (kind === 'circle') {
          const r = el.getBoundingClientRect();
          if (r.width > 0) {
            const w = r.width / scale;
            const h = r.height / scale;
            paths.push({
              d: circlePath(x(r.left) + w / 2, y(r.top) + h / 2, w / 2 + 7, h / 2 + 5, rng),
              ms: strokeMs('circle'),
            });
          }
        } else if (kind === 'arrow') {
          const to = root.querySelector<HTMLElement>(el.dataset.pencilTo ?? '');
          const first = lineRects(el)[0];
          const t = to?.getBoundingClientRect();
          if (first && t && t.width > 0) {
            const from: [number, number] = [x(first.left) - 10, y(first.top) + 4];
            const end: [number, number] = [x(t.left) - 10, y(t.top + t.height * 0.55)];
            paths.push({ d: arrowPath(from, end, -0.42, rng), ms: strokeMs('arrow') });
          }
        }
        if (paths.length > 0) shapes.set(key, paths);
      }
      root.removeAttribute('data-pen-measure');

      layer.replaceChildren();
      strokes = new Map();
      for (const [key, paths] of shapes) {
        const group = document.createElementNS(SVG_NS, 'g');
        group.dataset.key = key;
        layer.append(group);
        // Cada subcaminho (a ponta da seta, o segundo passe do sublinhado) vira um caminho próprio, desenhado depois
        // do anterior: o tracejado recomeça a cada `M` em alguns navegadores, e a ponta da seta sairia antes da curva.
        const list = paths.flatMap(({ d, ms }) => {
          const parts = d.split(/(?=M)/).map((piece) => {
            const path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('d', piece.trim());
            group.append(path);
            return { path, length: path.getTotalLength() };
          });
          const total = parts.reduce((sum, part) => sum + part.length, 0) || 1;
          return parts.map((part) => ({ ...part, ms: Math.max(90, (ms * part.length) / total) }));
        });
        if (drawn.has(key)) group.dataset.drawn = '';
        else list.forEach(hide);
        strokes.set(key, list);
      }
    };

    const groupOf = (key: string) =>
      [...layer.children].find((g) => g instanceof SVGGElement && g.dataset.key === key) as
        SVGGElement | undefined;

    /** Quanto o trecho demora para ser desenhado, em milissegundos. */
    const lengthOf = (target: Target) =>
      target.kind === 'mark'
        ? PEN.mark
        : (strokes.get(target.key) ?? []).reduce((sum, stroke) => sum + stroke.ms, 0);

    /**
     * Desenha um trecho. `instant`: aparece pronto (menos movimento, ou a rolagem já passou dele). `pace`: fração da
     * duração normal (a mão apressa quando há fila).
     */
    const draw = async (target: Target, instant: boolean, pace = 1) => {
      drawn.add(target.key);
      target.el.dataset.drawn = '';
      const group = groupOf(target.key);
      if (group) group.dataset.drawn = '';
      if (target.kind === 'mark') {
        if (instant) return;
        await play(
          target.el.animate([{ backgroundSize: '0% 100%' }, { backgroundSize: '100% 100%' }], {
            duration: PEN.mark * pace,
            easing: STROKE_EASE,
          }),
        );
        return;
      }
      for (const stroke of strokes.get(target.key) ?? []) {
        if (!alive) return;
        if (instant || !stroke.path.isConnected) {
          show(stroke);
          continue;
        }
        const animation = stroke.path.animate(
          [{ strokeDashoffset: `${stroke.length + 2}px` }, { strokeDashoffset: '0px' }],
          { duration: stroke.ms * pace, easing: STROKE_EASE, fill: 'forwards' },
        );
        await play(animation);
        show(stroke);
        animation.cancel();
      }
    };

    // A fila anda um trecho por vez, mas o próximo começa quando o anterior está terminando (`PEN.overlap`), como a
    // mão que já vai para o próximo trecho; com mais de um esperando, tudo anda mais depressa (`PEN.hurry`).
    const pump = async () => {
      if (pumping || !ready) return;
      pumping = true;
      await titleDone;
      while (alive && queued.length > 0) {
        const key = queued.shift();
        const target = targets.find((t) => t.key === key);
        if (!target) continue;
        const r = target.el.getBoundingClientRect();
        const offscreen = r.bottom < 0 || r.top > window.innerHeight;
        if (reduce || offscreen) {
          void draw(target, true);
          continue;
        }
        const pace = queued.length > 0 ? PEN.hurry : 1;
        const drawing = draw(target, false, pace);
        await Promise.race([drawing, sleep(lengthOf(target) * pace * PEN.overlap)]);
        await sleep(PEN.gap * pace);
      }
      pumping = false;
    };

    // Um trecho entra na fila quando o topo dele passa de 88% da altura da janela, inclusive quando a rolagem pulou
    // por cima dele. Conferir a posição a cada rolagem é mais previsível que um IntersectionObserver com limiar: o
    // WebKit às vezes não avisa de um trecho que passou depressa.
    const reveal = () => {
      if (!ready) return;
      cancelAnimationFrame(check);
      check = requestAnimationFrame(() => {
        const limit = window.innerHeight * REVEAL_AT;
        for (const t of targets) {
          if (drawn.has(t.key) || queued.includes(t.key)) continue;
          if (t.el.getBoundingClientRect().top < limit) queued.push(t.key);
        }
        void pump();
      });
    };
    // Captura: também ouve a rolagem de contêineres (a pré-visualização do painel).
    window.addEventListener('scroll', reveal, { capture: true, passive: true });
    window.addEventListener('resize', reveal, { passive: true });

    /** Escreve o título palavra por palavra (ver `about.module.css`). */
    const writeTitle = async () => {
      const words = [...root.querySelectorAll<HTMLElement>('[data-pen-word]')];
      // Menos movimento (o CSS não esconde nada) ou a reserva do CSS já mostrou o título: nada a escrever. Confere
      // antes do `data-pen`, que desliga a reserva (e esconderia de novo o título que ela já mostrou).
      const shown = words.length === 0 || getComputedStyle(words[0]!).transform === 'none';
      root.dataset.pen = '';
      if (reduce || shown) {
        root.dataset.penDone = '';
        return;
      }
      const animations = words.flatMap((word) => {
        const ink = word.firstElementChild;
        const tip = word.lastElementChild;
        if (!(ink instanceof HTMLElement) || !(tip instanceof HTMLElement) || ink === tip)
          return [];
        const delay = Number.parseFloat(word.style.getPropertyValue('--d')) || 0;
        const duration = Number.parseFloat(word.style.getPropertyValue('--t')) || 300;
        // A janela sai de antes da palavra (a largura dela mais a folga do recorte) e chega ao lugar.
        const shift = word.offsetWidth + 0.45 * Number.parseFloat(getComputedStyle(word).fontSize);
        const timing = { delay, duration, easing: WRITE_EASE, fill: 'both' } as const;
        return [
          word.animate(
            [{ transform: `translateX(${-shift}px)` }, { transform: 'translateX(0px)' }],
            timing,
          ),
          ink.animate(
            [{ transform: `translateX(${shift}px)` }, { transform: 'translateX(0px)' }],
            timing,
          ),
          tip.animate(
            [
              { opacity: 0 },
              { opacity: 1, offset: 0.1 },
              { opacity: 1, offset: 0.85 },
              { opacity: 0 },
            ],
            { delay, duration },
          ),
        ];
      });
      await Promise.all(animations.map(play));
      root.dataset.penDone = '';
      for (const animation of animations) animation.cancel();
    };

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
    void whenPainting(() => alive).then(() => {
      if (!alive) return;
      ready = true;
      titleDone = writeTitle();
      refresh();
    });
    // A fonte da serifa pode chegar depois: as linhas mudam de lugar e os traços precisam acompanhar.
    void document.fonts?.ready.then(() => {
      if (alive) refresh();
    });
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(refresh) : null;
    resize?.observe(root);
    // A pré-visualização do painel troca o texto sem mudar o tamanho da raiz.
    const mutations = new MutationObserver((records) => {
      if (records.some((r) => !svg.contains(r.target))) refresh();
    });
    mutations.observe(root, { subtree: true, childList: true, characterData: true });

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(check);
      for (const animation of running) animation.cancel();
      window.removeEventListener('scroll', reveal, { capture: true });
      window.removeEventListener('resize', reveal);
      resize?.disconnect();
      mutations.disconnect();
    };
  }, []);

  return (
    <svg ref={svgRef} className={styles.layer} aria-hidden="true" focusable="false">
      <g data-pencil-layer="" />
    </svg>
  );
}
