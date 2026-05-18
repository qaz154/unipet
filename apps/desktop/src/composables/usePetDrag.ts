export interface PetDragCallbacks {
  getEp: () => { dragLock: (x: number, y: number) => void; dragMove: (x: number, y: number) => void; dragEnd: () => void } | undefined;
  onMouseMove: (x: number, y: number) => void;
  setIsDrag: (dragging: boolean) => void;
}

export interface UsePetDragReturn {
  onDragStart: (e: PointerEvent) => void;
  onDragMove: (e: PointerEvent) => void;
  onDragEnd: (e: PointerEvent) => void;
}

const DRAG_THRESHOLD = 3;

export function usePetDrag(callbacks: PetDragCallbacks): UsePetDragReturn {
  let dragActive = false;
  let dragDidMove = false;
  let dragStartX = 0;
  let dragStartY = 0;

  function onDragStart(e: PointerEvent): void {
    dragStartX = e.screenX;
    dragStartY = e.screenY;
    dragDidMove = false;
    dragActive = true;
    callbacks.getEp()?.dragLock(e.screenX, e.screenY);
    (e.currentTarget as HTMLElement)?.setPointerCapture(e.pointerId);
  }

  function onDragMove(e: PointerEvent): void {
    if (!dragActive) {
      callbacks.onMouseMove(e.screenX, e.screenY);
      return;
    }
    const dx = e.screenX - dragStartX;
    const dy = e.screenY - dragStartY;
    if (!dragDidMove && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
    dragDidMove = true;
    callbacks.setIsDrag(true);
    callbacks.getEp()?.dragMove(e.screenX, e.screenY);
  }

  function onDragEnd(e: PointerEvent): void {
    if (!dragActive) return;
    dragActive = false;
    callbacks.setIsDrag(false);
    callbacks.getEp()?.dragEnd();
    try { (e.currentTarget as HTMLElement)?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  return { onDragStart, onDragMove, onDragEnd };
}
