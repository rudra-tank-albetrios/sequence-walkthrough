import { create } from 'zustand';

/**
 * What the viewer knows about the drawn diagram and other features need: exports take the clean
 * SVG and the theme background, the table and the walkthrough read whether a diagram is shown.
 */
export interface DiagramState {
  /** The sanitised SVG as rendered, without the viewer's overlays. */
  cleanSvg: string;
  themeBg: string;
  themeDark: boolean;
  width: number;
  height: number;
  /** Mermaid's message when the code could not be drawn, or null. */
  error: string | null;
  rendering: boolean;
  /** Milliseconds the last render took. */
  lastRenderMs: number;
  zoom: number;
  /** Pixels the floating header and bottom dock cover at the top and bottom of the canvas. */
  insets: { top: number; bottom: number };
  /** Commands other features can send to the viewer. */
  commands: {
    zoomIn: () => void;
    zoomOut: () => void;
    zoomTo: (k: number) => void;
    fitWidth: () => void;
    fitAll: () => void;
    panBy: (dx: number, dy: number) => void;
    /** The live SVG element with overlays, for the step image export. */
    svgElement: () => SVGSVGElement | null;
  };
  setCommands: (commands: DiagramState['commands']) => void;
  setRendered: (patch: Partial<Pick<DiagramState, 'cleanSvg' | 'themeBg' | 'themeDark' | 'width' | 'height' | 'error' | 'rendering' | 'lastRenderMs'>>) => void;
  setZoom: (zoom: number) => void;
  setInsets: (insets: DiagramState['insets']) => void;
}

const noop = () => {
  /* the viewer is not mounted */
};

export const useDiagramStore = create<DiagramState>((set) => ({
  cleanSvg: '',
  themeBg: '#ffffff',
  themeDark: false,
  width: 0,
  height: 0,
  error: null,
  rendering: false,
  lastRenderMs: 0,
  zoom: 1,
  insets: { top: 0, bottom: 0 },
  commands: {
    zoomIn: noop,
    zoomOut: noop,
    zoomTo: noop,
    fitWidth: noop,
    fitAll: noop,
    panBy: noop,
    svgElement: () => null,
  },
  setCommands(commands) {
    set({ commands });
  },
  setRendered(patch) {
    set(patch);
  },
  setZoom(zoom) {
    set({ zoom });
  },
  setInsets(insets) {
    set({ insets });
  },
}));
