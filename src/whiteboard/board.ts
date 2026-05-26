export function initBoard(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#666";
  ctx.font = "16px sans-serif";
  ctx.fillText("canvas stub — drawing not implemented yet", 20, 30);
}
