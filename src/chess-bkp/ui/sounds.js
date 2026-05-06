export function createMoveAudio(moveSound, captureSound) {
  const moveAudio = new Audio(moveSound);
  const captureAudio = new Audio(captureSound);

  function playMove() {
    try {
      moveAudio.currentTime = 0;
      moveAudio.play();
    } catch {}
  }

  function playCapture() {
    try {
      captureAudio.currentTime = 0;
      captureAudio.play();
    } catch {}
  }

  function playFromSan(san) {
    if (!san) return playMove();
    if (san.includes("x")) return playCapture();
    return playMove();
  }

  return { playMove, playCapture, playFromSan };
}