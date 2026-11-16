// input.js — keyboard, mouse and pointer lock. Keeps one mutable input state that
// the fixed-step simulation reads; mouse deltas are accumulated and consumed once
// per frame by main.js.

export function createInput(canvas, onLockChange) {
  const state = {
    keys: new Set(),
    lookX: 0,
    lookY: 0,
    firing: false,
    locked: false,
  };

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    state.keys.add(event.code);
    if (event.code === 'ControlLeft' || event.code === 'ControlRight') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => state.keys.delete(event.code));
  window.addEventListener('blur', () => {
    state.keys.clear();
    state.firing = false;
  });
  document.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    // Consume the accumulated look delta for this frame.
    takeLook() {
      const look = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return look;
    },
  };
}
