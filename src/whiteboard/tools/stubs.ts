import type { Tool, ToolId } from "./tool";

function stub(id: ToolId, cursor: string): Tool {
  return { id, cursor };
}

export const pencilTool = stub("pencil", "crosshair");
export const lineTool = stub("line", "crosshair");
export const rectTool = stub("rect", "crosshair");
export const circleTool = stub("circle", "crosshair");
export const selectTool = stub("select", "default");
