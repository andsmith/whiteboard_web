import { panTool } from "./pan";
import { selectTool } from "./select";
import { modifyTool } from "./modify";
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
  modify: modifyTool,
  pencil: pencilTool,
  line: lineTool,
  rect: rectTool,
  circle: circleTool,
  text: textTool,
  polyline: polylineTool,
};

// Three navigation tools on top, separated from the drawing tools.
export const NAV_TOOL_ORDER: ToolId[] = ["select", "pan", "modify"];

export const DRAW_TOOL_ORDER: ToolId[] = [
  "pencil", "line",
  "rect", "circle",
  "text", "polyline",
];
