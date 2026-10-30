import type { Flow } from '@swv/core';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useIsNarrow, useReducedMotion } from '../../shared/hooks/useMediaQuery.ts';
import { clamp } from '../../shared/lib/util.ts';
import { useDiagramStore } from '../../shared/state/diagramStore.ts';
import { useFlowStore } from '../../shared/state/flowStore.ts';
import { noteMark, useNotesStore } from '../../shared/state/notesStore.ts';
import { hasPaths, pathLabel, pathVisible } from '../../shared/state/path.ts';
import { followHits } from '../../shared/state/search.ts';
import { Button } from '../../shared/ui/Button.tsx';
import { toast } from '../../shared/ui/toast.ts';
import { Camera, type CameraState } from './camera.ts';
import { CanvasControls } from './CanvasControls.tsx';
import { DiagramSvg } from './DiagramSvg.tsx';
import { addHits, measure, normalizeSvg, tagSteps, type Geo, type StepDom, type ViewBox } from './geometry.ts';
import { buildHeader, headerPlacement, setActiveActors } from './header.ts';
import { MERMAID_VERSION, renderDiagram, type RenderedDiagram } from './mermaid.ts';
import { applyHighlight, decorate, drawChapterBand, type DrawContext } from './overlays.ts';
import { LayerTooltip, StepTooltip } from './StepTooltip.tsx';
import { useCanvasPointer } from './useCanvasPointer.ts';
import styles from './viewer.module.css';

/** Tooltip target with its position inside the canvas, computed when the pointer moved. */
type Tip =
  | { kind: 'step'; index: number; left: number; top: number }
  | { kind: 'actor'; alias: string; left: number; top: number };

interface Mounted {
  svg: SVGSVGElement;
  header: SVGSVGElement | null;
  vb: ViewBox;
  dom: StepDom[];
  geo: Geo;
  flow: Flow;
}

/** The diagram canvas: Mermaid's SVG with the walkthrough's overlays, pan, zoom and hover. */
export function Viewer() {
  const code = useFlowStore((s) => s.code);
  const flow = useFlowStore((s) => s.flow);
  const cur = useFlowStore((s) => s.cur);
  const view = useFlowStore((s) => s.view);
  const path = useFlowStore((s) => s.path);
  const spot = useFlowStore((s) => s.spot);
  const follow = useFlowStore((s) => s.follow);
  const settings = useFlowStore((s) => s.settings);
  const codeOpen = useFlowStore((s) => s.ui.codeOpen);
  const lastGo = useFlowStore((s) => s.lastGo);
  const go = useFlowStore((s) => s.go);
  const setSpot = useFlowStore((s) => s.setSpot);
  const setPath = useFlowStore((s) => s.setPath);
  const setFollow = useFlowStore((s) => s.setFollow);
  const notesData = useNotesStore((s) => s.data);
  const noteEntry = useNotesStore((s) => s.entry);
  const setRendered = useDiagramStore((s) => s.setRendered);
  const setCommands = useDiagramStore((s) => s.setCommands);
  const setZoom = useDiagramStore((s) => s.setZoom);
  const narrow = useIsNarrow();
  const reduced = useReducedMotion();

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const hdrLayerRef = useRef<HTMLDivElement | null>(null);
  const hdrBandRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef<Mounted | null>(null);
  const renderSeq = useRef(0);
  const firstFit = useRef(true);
  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  const [rendered, setRenderedState] = useState<RenderedDiagram | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [mountVersion, setMountVersion] = useState(0);

  const applyCamera = useCallback(
    (state: CameraState) => {
      const layer = layerRef.current;
      const canvas = canvasRef.current;
      if (layer) layer.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.k})`;
      if (canvas) {
        const g = 20 * state.k;
        canvas.style.backgroundSize = `${g}px ${g}px`;
        canvas.style.backgroundPosition = `${state.x}px ${state.y}px`;
      }
      const m = mountedRef.current;
      const hdr = hdrLayerRef.current;
      const band = hdrBandRef.current;
      const placement = m?.header && m.flow.isSequence ? headerPlacement(m.geo, state) : null;
      if (hdr && band) {
        hdr.hidden = !placement;
        band.hidden = !placement;
        if (placement) {
          hdr.style.transform = `translate(${state.x}px, ${placement.top}px) scale(${state.k})`;
          band.style.top = `${placement.top}px`;
          band.style.height = `${placement.height}px`;
        }
      }
      setZoom(Math.round(state.k * 100) / 100);
      setTip(null);
    },
    [setZoom],
  );

  const [camera] = useState(() => new Camera());
  useEffect(() => {
    camera.bind(
      () => ({ w: canvasRef.current?.clientWidth ?? 0, h: canvasRef.current?.clientHeight ?? 0 }),
      applyCamera,
      () => reducedRef.current,
    );
  }, [camera, applyCamera]);
  const insetLeft = useCallback(() => {
    if (!codeOpen || narrow) return 0;
    return document.getElementById('codePanel')?.offsetWidth ?? 0;
  }, [codeOpen, narrow]);

  // Render with Mermaid whenever the code or the theme changes; stale renders are dropped.
  useEffect(() => {
    if (!code.trim()) return;
    const seq = ++renderSeq.current;
    const t0 = performance.now();
    setRendered({ rendering: true });
    renderDiagram(code, settings.theme, `swv${seq}`)
      .then((result) => {
        if (seq !== renderSeq.current) return;
        setRenderedState(result);
        setError(null);
        setRendered({ error: null, rendering: false, lastRenderMs: performance.now() - t0 });
      })
      .catch((err: unknown) => {
        if (seq !== renderSeq.current) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setRendered({ error: message, rendering: false });
      });
  }, [code, settings.theme, setRendered]);

  // The SVG just reached the page: measure it, map arrows to steps, build the pinned header.
  useLayoutEffect(() => {
    const svg = layerRef.current?.querySelector('svg');
    if (!svg || !rendered || !flow) return;
    const vb = normalizeSvg(svg);
    const cleanSvg = svg.outerHTML;
    let mounted: Mounted = { svg, header: null, vb, dom: [], geo: { actors: {}, rowTop: 0, rowBottom: 0, bottomTop: vb.h, hdrTop: -6, hdrH: 12 }, flow };
    if (flow.isSequence) {
      const tagged = tagSteps(svg, flow);
      const measured = measure(svg, tagged.dom, flow, vb);
      addHits(measured.dom);
      const header = buildHeader(svg, svg.id, vb, measured.geo, flow.participants);
      hdrLayerRef.current?.replaceChildren(...(header ? [header] : []));
      if (hdrBandRef.current) hdrBandRef.current.style.background = rendered.themeBg;
      mounted = { svg, header, vb, dom: measured.dom, geo: measured.geo, flow };
      if (tagged.mismatch) {
        toast(`Mermaid drew ${tagged.dom.length} arrows but ${flow.steps.length} were read; highlights may be off`);
      }
    } else {
      hdrLayerRef.current?.replaceChildren();
    }
    mountedRef.current = mounted;
    camera.setContent(vb.w, vb.h);
    if (firstFit.current) {
      camera.initial();
      firstFit.current = false;
    } else camera.refresh();
    setRendered({ cleanSvg, themeBg: rendered.themeBg, themeDark: rendered.dark, width: vb.w, height: vb.h });
    setMountVersion((v) => v + 1);
  }, [rendered, flow, camera, setRendered]);

  const drawContext = useCallback((): DrawContext | null => {
    const m = mountedRef.current;
    if (!m || !m.flow.isSequence || !rendered) return null;
    return { svg: m.svg, dom: m.dom, flow: m.flow, vb: m.vb, geo: m.geo, dark: rendered.dark };
  }, [rendered]);

  // Current step: marker, pill, ring, chapter band, halos on the two participants.
  useEffect(() => {
    const ctx = drawContext();
    const m = mountedRef.current;
    if (!ctx || !m) return;
    applyHighlight(ctx, cur, settings.dim);
    drawChapterBand(ctx, cur, settings.bands);
    const step = ctx.flow.steps[cur];
    setActiveActors(m.svg, m.header, m.geo, m.vb, step ? [step.from, step.to] : [], ctx.dark);
  }, [cur, settings.dim, settings.bands, drawContext, mountVersion]);

  // Follow rings, bookmark marks, spotlight, path fading and trust boundaries.
  useEffect(() => {
    const ctx = drawContext();
    if (!ctx) return;
    decorate(ctx, {
      followHits: new Set(follow?.hits ?? []),
      marks: (i) => noteMark(noteEntry(ctx.flow.steps[i])),
      spot,
      visible: (i) => {
        const s = ctx.flow.steps[i];
        return s ? pathVisible(s, path) : true;
      },
    });
  }, [follow, spot, path, notesData, noteEntry, drawContext, mountVersion]);

  // Bring the step into view when the walkthrough moves, and again after a re-render.
  useEffect(() => {
    const m = mountedRef.current;
    if (!m || view !== 'diagram' || !lastGo.camera || lastGo.index < 0) return;
    const d = m.dom[lastGo.index];
    if (d) camera.followStep(d.box, d.labelBox, m.flow.isSequence ? m.geo.hdrH : 0, insetLeft());
  }, [lastGo, view, camera, insetLeft, mountVersion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      camera.refresh();
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
    };
  }, [camera]);

  useEffect(() => {
    setCommands({
      zoomIn: () => {
        camera.zoomCenter(1.25);
      },
      zoomOut: () => {
        camera.zoomCenter(0.8);
      },
      zoomTo: (k) => {
        camera.zoomTo(k);
      },
      fitWidth: () => {
        camera.fitWidth(insetLeft());
      },
      fitAll: () => {
        camera.fitAll(insetLeft());
      },
      panBy: (dx, dy) => {
        camera.panBy(dx, dy);
      },
      svgElement: () => mountedRef.current?.svg ?? null,
    });
  }, [camera, insetLeft, setCommands]);

  const handlers = useMemo(() => {
    function startFollow(token: string) {
      const current = useFlowStore.getState();
      const hits = followHits(current.flow, token);
      if (hits === null) {
        toast(`"${token}" is too short or too common to follow`);
        return;
      }
      if (hits.length === 0) {
        toast(`"${token}" does not appear in any step`);
        return;
      }
      setFollow({ token, hits });
    }
    return {
      onClick(target: Element) {
        const m = mountedRef.current;
        const stepEl = target.closest('[data-step]');
        if (stepEl && m?.flow.isSequence) {
          go(Number(stepEl.getAttribute('data-step')));
          return;
        }
        const actor = target.closest('.swv-actor');
        if (actor) {
          const alias = actor.getAttribute('data-alias');
          if (alias) setSpot(useFlowStore.getState().spot === alias ? null : alias);
        }
      },
      onHover(target: Element | null, x: number, y: number) {
        const m = mountedRef.current;
        const canvas = canvasRef.current;
        if (!target || !m?.flow.isSequence || !canvas) {
          setTip(null);
          return;
        }
        const r = canvas.getBoundingClientRect();
        const at = { left: clamp(x - r.left + 14, 8, r.width - 320), top: clamp(y - r.top + 16, 8, r.height - 200) };
        const actor = target.closest('.swv-actor');
        const alias = actor?.getAttribute('data-alias');
        if (alias) {
          setTip({ kind: 'actor', alias, ...at });
          return;
        }
        const stepEl = target.closest('[data-step]');
        if (stepEl) setTip({ kind: 'step', index: Number(stepEl.getAttribute('data-step')), ...at });
        else setTip(null);
      },
      onDoubleClick(x: number, y: number) {
        // Pointer capture retargets dblclick to the canvas, so look up what is under the pointer.
        const under = document.elementFromPoint(x, y);
        const hit = under?.closest('[data-step]');
        const m = mountedRef.current;
        const d = hit && m ? m.dom[Number(hit.getAttribute('data-step'))] : undefined;
        if (!d) return;
        for (const t of d.texts) {
          const ctm = t.getScreenCTM();
          if (!ctm || !(t instanceof SVGTextContentElement)) continue;
          const pt = new DOMPoint(x, y).matrixTransform(ctm.inverse());
          let ci: number;
          try {
            ci = t.getCharNumAtPosition(pt);
          } catch {
            continue;
          }
          if (ci < 0) continue;
          const text = t.textContent;
          for (const match of text.matchAll(/\/?[\p{L}\p{N}](?:[\p{L}\p{N}_\-./]*[\p{L}\p{N}])?/gu)) {
            if (ci >= match.index && ci < match.index + match[0].length) {
              window.getSelection()?.removeAllRanges();
              startFollow(match[0]);
              return;
            }
          }
        }
      },
      wheelMode: () => useFlowStore.getState().settings.wheel,
    };
  }, [go, setSpot, setFollow]);
  useCanvasPointer(canvasRef, camera, handlers);


  const canvasStyle = {
    ['--canvas-bg' as string]: rendered?.themeBg ?? undefined,
    ['--grid-dot' as string]: rendered?.dark ? 'rgba(220,225,235,.22)' : 'rgba(90,100,120,.28)',
  };
  const spotCount = spot && flow ? flow.steps.filter((s) => s.from === spot || s.to === spot).length : 0;
  const pathCount = flow ? flow.steps.filter((s) => pathVisible(s, path)).length : 0;
  const tipStep = tip?.kind === 'step' && flow ? flow.steps[tip.index] : undefined;

  return (
    <div
      ref={canvasRef}
      className={`${styles.canvas} ${settings.grid ? styles.grid : ''}`}
      style={canvasStyle}
      tabIndex={0}
      role="application"
      aria-roledescription="diagram canvas"
      aria-label="Diagram. Arrow keys step through the flow, drag or scroll to move, plus and minus zoom."
      data-testid="diagram"
      hidden={view !== 'diagram'}
    >
      <div ref={layerRef} className={styles.layer}>
        {rendered ? <DiagramSvg svg={rendered.svg} className="" /> : null}
      </div>
      <div ref={hdrBandRef} className={styles.hdrBand} hidden />
      <div ref={hdrLayerRef} className={styles.hdrLayer} hidden />
      {!rendered && !error ? <div className={styles.loading}>Loading Mermaid {MERMAID_VERSION}…</div> : null}
      {error ? (
        <div className={`${styles.message} ${styles.error}`} role="alert" data-canvas-ui>
          Mermaid could not draw this code. {error.split('\n')[0]}
        </div>
      ) : spot && flow ? (
        <div className={styles.message} role="status" data-canvas-ui>
          Showing only the {spotCount} arrows of <b>{flow.layers[spot]?.name ?? spot}</b>.
          <Button
            className={styles.small}
            onClick={() => {
              setSpot(null);
            }}
          >
            Show all
          </Button>
        </div>
      ) : path !== 'all' && flow && hasPaths(flow) ? (
        <div className={styles.message} role="status" data-canvas-ui>
          Path: <b>{pathLabel(path, flow)}</b>, {pathCount} of {flow.steps.length} steps.
          <Button
            className={styles.small}
            onClick={() => {
              setPath('all');
            }}
          >
            Show all
          </Button>
        </div>
      ) : flow && !flow.isSequence && rendered ? (
        <div className={styles.message} role="status" data-canvas-ui>
          This is a {flow.diagramType} diagram, so the walkthrough is off. Pan and zoom still work.
        </div>
      ) : null}
      <CanvasControls />
      {tip && flow ? (
        <div
          className={styles.tooltip}
          role="tooltip"
          style={{ left: tip.left, top: tip.top }}
          data-testid="arrow-tooltip"
        >
          {tip.kind === 'actor' ? (
            <LayerTooltip flow={flow} alias={tip.alias} />
          ) : tipStep ? (
            <StepTooltip flow={flow} step={tipStep} note={noteEntry(tipStep)} current={tipStep.idx === cur} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

