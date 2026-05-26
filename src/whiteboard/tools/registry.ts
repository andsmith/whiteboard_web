import { panTool } from "./pan";
import { selectTool } from "./select";
import { pencilTool } from "./pencil";
import { lineTool } from "./line";
import { rectTool } from "./rect";
import { circleTool } from "./circle";
import { textTool } from "./text";
import { polylineTool } from "./polyline";
import type { Tool, ToolId } from "./tool";

export const TOOLS: Record<ToolId, Tool> = {
  select: selectTool,
  pan: panTool,
  pencil: pencilTool,
  line: lineTool,
  rect: rectTool,
  circle: circleTool,
  text: textTool,
  polyline: polylineTool,
};

// Navigation tools (top of left panel, separated from drawing tools)
export const NAV_TOOL_ORDER: ToolId[] = ["select", "pan"];

// Drawing tools (3×2 grid below)
export const DRAW_TOOL_ORDER: ToolId[] = [
  "pencil", "line",
  "rect", "circle",
  "text", "polyline",
];
