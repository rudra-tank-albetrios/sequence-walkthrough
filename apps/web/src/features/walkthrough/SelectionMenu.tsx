import { isFollowable, tokens } from '@swv/core';
import { useEffect, useRef, useState } from 'react';

import { clamp } from '../../shared/lib/util.ts';
import { askAboutWord, startFollow } from '../../shared/state/follow.ts';
import styles from './selection.module.css';

interface MenuState {
  word: string;
  x: number;
  y: number;
}

/** The one followable word in the current selection, or null. */
function selectedWord(): string | null {
  const text = window.getSelection()?.toString().trim() ?? '';
  if (!text) return null;
  const words = tokens(text);
  const word = words[0];
  return words.length === 1 && word !== undefined && isFollowable(word) ? word : null;
}

/**
 * Right-click with exactly one followable word selected: a small menu offers to follow it or to
 * ask the AI what it is. Anywhere else the browser's own menu appears.
 */
export function SelectionMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Some browsers move the selection on the right button's press, before the menu event fires.
    let pressed: string | null = null;
    const onPress = (ev: PointerEvent) => {
      pressed = ev.button === 2 ? selectedWord() : null;
    };
    const onContext = (ev: MouseEvent) => {
      const target = ev.target instanceof Element ? ev.target : null;
      if (target?.closest('textarea, input')) return;
      const word = selectedWord() ?? pressed;
      pressed = null;
      if (!word) return;
      ev.preventDefault();
      setMenu({ word, x: ev.clientX, y: ev.clientY });
    };
    document.addEventListener('pointerdown', onPress, true);
    document.addEventListener('contextmenu', onContext);
    return () => {
      document.removeEventListener('pointerdown', onPress, true);
      document.removeEventListener('contextmenu', onContext);
    };
  }, []);

  useEffect(() => {
    if (!menu) return;
    boxRef.current?.querySelector('button')?.focus();
    const close = () => {
      setMenu(null);
    };
    const onDown = (ev: PointerEvent) => {
      if (!(ev.target instanceof Node) || !boxRef.current?.contains(ev.target)) close();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        close();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  if (!menu) return null;
  const left = clamp(menu.x, 8, window.innerWidth - 220);
  const top = clamp(menu.y, 8, window.innerHeight - 90);
  return (
    <div ref={boxRef} className={styles.menu} role="menu" aria-label="Selected word" style={{ left, top }} data-testid="ctx">
      <button
        type="button"
        role="menuitem"
        className={styles.item}
        onClick={() => {
          setMenu(null);
          startFollow(menu.word);
        }}
      >
        Follow “{menu.word}”
      </button>
      <button
        type="button"
        role="menuitem"
        className={styles.item}
        onClick={() => {
          setMenu(null);
          askAboutWord(menu.word);
        }}
      >
        Ask AI: what is “{menu.word}”?
      </button>
    </div>
  );
}
