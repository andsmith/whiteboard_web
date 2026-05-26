import { panTool } from "./pan";
import { pencilTool, lineTool, rectTool, circleTool, selectTool } from "./stubs";
import type { Tool, ToolId } from "./tool";

export const TOOLS: Record<ToolId, Tool> = {
  pencil: pencilTool,
  line: lineTool,
  rect: rectTool,
  circle: circleTool,
  select: selectTool,
  pan: panTool,
};

// 3 rows × 2 cols, matches reference (pencil/line, rect/circle, select/pan)
export const TOOL_ORDER: ToolId[] = ["pencil", "line", "rect", "circle", "select", "pan"];
