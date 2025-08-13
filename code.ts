// This plugin will open a window to prompt the user to enter a number, and
// it will then create that many shapes and connectors on the screen.

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// This shows the HTML page in "ui.html".
figma.showUI(__html__, {
  width: 450,
  height: 700,
  themeColors: true,
});

interface CreatePuzzleMessage {
  type: "create-puzzle";
  rows: number;
  columns: number;
  imageData: ArrayBuffer;
  originalImageWidth: number;
  originalImageHeight: number;
}

interface CreateShapesMessage {
  type: "create-shapes";
  rows: number;
  columns: number;
  imageData?: ArrayBuffer;
  imageName?: string;
}

interface Neighbor {
  neighborId: string;
  isTab: boolean; // true if sticks out, false if indent
}

interface NeighborsData {
  left?: Neighbor;
  right?: Neighbor;
  top?: Neighbor;
  bottom?: Neighbor;
}

type PluginMessage =
  | CreatePuzzleMessage
  | CreateShapesMessage
  | { type: "debug" };

// --- Curved stud configuration and helpers ----------------------------------
type StudConfig = {
  widthFactor: number;   // stud width relative to min(w,h)
  depthFactor: number;   // stud depth relative to min(w,h)
  rise1: number;         // first rise fraction of depth
  rise2: number;         // second rise fraction of depth
  blend: number;         // 0..1 rounding of crown
  cornerJog: number;     // small chamfer at corners in units of depth
};

const STUD_CFG: StudConfig = {
  widthFactor: 1 / 3,
  depthFactor: 1 / 6,
  rise1: 0.5,
  rise2: 0.7,
  blend: 0.2,
  cornerJog: 1.0,
};

const L = (x: number, y: number) => ` L ${x} ${y}`;
const C = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
  y: number
) => ` C ${x1} ${y1} ${x2} ${y2} ${x} ${y}`;

type Side = "top" | "right" | "bottom" | "left";
function makeSideTransform(side: Side, w: number, h: number) {
  switch (side) {
    case "top":
      return (x: number, y: number) => [x, y] as const;
    case "right":
      return (x: number, y: number) => [w - y, x] as const; // rotate 90° CW
    case "bottom":
      return (x: number, y: number) => [w - x, h - y] as const; // 180°
    case "left":
      return (x: number, y: number) => [y, h - x] as const; // 270° CW
  }
}

function edgeWithStud(
  side: Side,
  w: number,
  h: number,
  hasNeighbor: boolean,
  isTab: boolean | undefined,
  cfg: StudConfig
) {
  const minDim = Math.min(w, h);
  const studW = minDim * cfg.widthFactor;
  const depth = minDim * cfg.depthFactor;
  const jog = cfg.cornerJog * depth;

  // Length across this side (x dimension in local top-frame for the side)
  const across = side === "top" || side === "bottom" ? w : h;
  const mid = across / 2;
  const half = studW / 2;
  const yBase = 0;
  const dy = isTab ? -depth : depth; // outward on TOP is negative y

  const blend = cfg.blend;
  const rise1 = cfg.rise1 * dy;
  const rise2 = cfg.rise2 * dy;

  const T = makeSideTransform(side, w, h);
  const l = (x: number, y: number) => L(...T(x, y));
  const c = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x: number,
    y: number
  ) => C(...T(x1, y1), ...T(x2, y2), ...T(x, y));

  let d = "";
  // Do not move (M) here; caller already positioned the pen at the corner
  d += l(-jog, -jog);
  d += l(0, 0);

  if (!hasNeighbor || isTab === undefined) {
    d += l(across, yBase);
    return d;
  }

  d += l(mid - half, yBase);
  d += c(mid - half + half * blend, yBase, mid - half, yBase + rise1, mid - half, yBase + rise2);
  d += c(mid - half, yBase + dy, mid - half * (1 - blend), yBase + dy, mid, yBase + dy);
  d += c(mid + half * (1 - blend), yBase + dy, mid + half, yBase + dy, mid + half, yBase + rise2);
  d += c(mid + half, yBase + rise1, mid + half * (1 - blend), yBase, mid + half, yBase);
  d += l(across, yBase);
  return d;
}

function buildPiecePath(
  w: number,
  h: number,
  neighbors: { top?: { isTab: boolean }; right?: { isTab: boolean }; bottom?: { isTab: boolean }; left?: { isTab: boolean } },
  cfg: StudConfig
) {
  // Start once, then continue with a single continuous subpath
  let d = `M 0 0`;
  d += edgeWithStud("top", w, h, !!neighbors.top, neighbors.top?.isTab, cfg);
  d += edgeWithStud("right", w, h, !!neighbors.right, neighbors.right?.isTab, cfg);
  d += edgeWithStud("bottom", w, h, !!neighbors.bottom, neighbors.bottom?.isTab, cfg);
  d += edgeWithStud("left", w, h, !!neighbors.left, neighbors.left?.isTab, cfg);
  d += " Z";
  return d;
}

figma.ui.onmessage = async (msg: PluginMessage) => {
  if (msg.type === "debug") {
    return;
  }
  // Handle puzzle creation with individual pieces
  if (msg.type === "create-puzzle") {
    const rows = msg.rows;
    const columns = msg.columns;
    const originalImageWidth = msg.originalImageWidth;
    const originalImageHeight = msg.originalImageHeight;

    const nodes: VectorNode[][] = [];
    // Calculate proper piece dimensions based on the original image
    const pieceWidth = originalImageWidth / columns;
    const pieceHeight = originalImageHeight / rows;

    const imageHash = figma.createImage(new Uint8Array(msg.imageData)).hash;

    const D = Math.min(pieceWidth, pieceHeight) / 6;

    // const X = studWidth/2;
    // const Y = D/2;

    // Create shapes in a grid with no spacing (completed puzzle)
    for (let row = 0; row < rows; row++) {
      nodes[row] = [];
      for (let col = 0; col < columns; col++) {
        const vector = figma.createVector();

        // Calculate canvas bounds for scattering
        const canvasWidth = Math.max(1200, originalImageWidth * 2);
        const canvasHeight = Math.max(800, originalImageHeight * 2);

        // SCATTER pieces randomly instead of grid alignment
        const scatterX = Math.random() * (canvasWidth - pieceWidth);
        const scatterY = Math.random() * (canvasHeight - pieceHeight);
        
        vector.x = scatterX;
        vector.y = scatterY;
        // Remove rotation - pieces maintain their original orientation
        vector.strokeWeight = 0;

        // Apply the specific puzzle piece image (already cropped)
        // const imageHash = imageHashes[row][col];
        vector.fills = [
          {
            type: "IMAGE",
            imageHash: imageHash,
            scaleMode: "CROP",
            imageTransform: [[(pieceWidth+2*D)/originalImageWidth, 0, col/columns - D/originalImageWidth], [0, (pieceHeight+2*D)/originalImageHeight, row/rows - D/originalImageHeight]]
          },
        ];
      
        nodes[row][col] = vector;
      }
    }

    // set neighbor data
    const neighborsData: NeighborsData[][] = [];
    for (let row = 0; row < nodes.length; row++) {
      neighborsData.push([]);
      for (let col = 0; col < nodes[row].length; col++) {
        const neighbors: NeighborsData = {
          left:
            col - 1 >= 0 && nodes[row][col - 1]
              ? {
                  neighborId: nodes[row][col - 1].id,
                  isTab: !neighborsData[row][col - 1].right!.isTab,
                }
              : undefined,
          right:
            col + 1 < nodes[row].length && nodes[row][col + 1]
              ? {
                  neighborId: nodes[row][col + 1].id,
                  isTab: Math.random() < 0.5,
                }
              : undefined,
          top:
            row - 1 >= 0 && nodes[row - 1] && nodes[row - 1][col]
              ? {
                  neighborId: nodes[row - 1][col].id,
                  isTab: !neighborsData[row - 1][col].bottom!.isTab,
                }
              : undefined,
          bottom:
            row + 1 < nodes.length && nodes[row + 1] && nodes[row + 1][col]
              ? {
                  neighborId: nodes[row + 1][col].id,
                  isTab: Math.random() < 0.5,
                }
              : undefined,
        };
        neighborsData[row].push(neighbors);
        nodes[row][col].setPluginData(
          "puzzleNeighbors",
          JSON.stringify(neighbors)
        );
      }
    }

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const neighbors = neighborsData[row][col];
        const pathData = buildPiecePath(
          pieceWidth,
          pieceHeight,
          {
            top: neighbors.top && { isTab: neighbors.top.isTab },
            right: neighbors.right && { isTab: neighbors.right.isTab },
            bottom: neighbors.bottom && { isTab: neighbors.bottom.isTab },
            left: neighbors.left && { isTab: neighbors.left.isTab },
          },
          STUD_CFG
        );
        nodes[row][col].vectorPaths = [
          { windingRule: "EVENODD", data: pathData },
        ];
      }
    }

    // Select all shapes (no connectors)
    const allNodes: SceneNode[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        allNodes.push(nodes[row][col]);
        figma.currentPage.appendChild(nodes[row][col]);
      }
    }

    figma.viewport.scrollAndZoomIntoView(allNodes);

    figma.notify(
      `Created ${rows}×${columns} scrambled puzzle! Arrange the pieces to solve. 🧩`
    );
  }

  // Make sure to close the plugin when you're done. Otherwise the plugin will
  // keep running, which shows the cancel button at the bottom of the screen.
  figma.closePlugin();
};
