/** One width-driven surface owns the height; the Tavern chat viewport is never resized. */
export function installDesktopSizing(root: HTMLElement, updateFrame: (height: number) => void) {
  const document = root.ownerDocument;
  const win = document.defaultView || (globalThis as any).window;
  document.documentElement.style.height = 'auto';
  document.body.style.height = 'auto';
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
  root.style.width = '100%';
  root.style.minHeight = '0';
  let previous = -1;

  const resize = () => {
    const width = root.getBoundingClientRect().width;
    if (width <= 0) return;

    let parentH: number;
    try {
      parentH = win?.parent?.innerHeight || 0;
    } catch {
      parentH = 0;
    }
    const screenH = win?.screen?.height || 0;
    const isLandscapeOrientation = win?.matchMedia?.('(orientation: landscape)').matches ?? false;

    // Detect mobile landscape: parent height is short (<= 500px) or landscape orientation on phone
    const isLandscapeMobile =
      (parentH > 0 && parentH <= 500) ||
      (screenH > 0 && screenH <= 500 && width > 500) ||
      (isLandscapeOrientation && width > 600 && parentH > 0 && parentH <= 560);

    let height: number;
    let aspectRatio: string;

    if (isLandscapeMobile) {
      // Landscape mobile (e.g. 844x390): screen height is tight (~280px chat area).
      // Arrange height independently so it does not scale infinitely with width.
      const targetH = parentH > 0 ? Math.max(250, Math.min(290, parentH - 95)) : 275;
      height = targetH;
      aspectRatio = `${width} / ${height}`;
    } else if (width < 500) {
      // Portrait mobile (e.g. 390x844, 360x800): significantly increase vertical height (~1.62 ratio)
      // gives ~530-600px of comfortable reading and modal space instead of previous ~345-376px.
      height = Math.ceil(width * (81 / 50));
      aspectRatio = '50 / 81';
    } else if (width < 900) {
      // Medium / tablet
      height = Math.ceil(width * (3 / 4));
      aspectRatio = '4 / 3';
    } else {
      // Desktop standard
      height = Math.ceil(width * (21 / 32));
      aspectRatio = '32 / 21';
    }

    root.style.aspectRatio = aspectRatio;
    root.style.height = height + 'px';
    if (height === previous) return;
    previous = height;
    updateFrame(height);
  };

  const observer = new ResizeObserver(resize);
  observer.observe(root);
  resize();
  win?.addEventListener?.('resize', resize);
  return () => {
    observer.disconnect();
    win?.removeEventListener?.('resize', resize);
  };
}

