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

// Calls to "parent.postMessage" from within the HTML page will trigger this
// callback. The callback will be passed the "pluginMessage" property of the
// posted message.
interface PuzzlePieceData {
  row: number;
  col: number;
  imageData: ArrayBuffer;
}

interface CreatePuzzleMessage {
  type: "create-puzzle";
  rows: number;
  columns: number;
  puzzleData: PuzzlePieceData[];
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

figma.ui.onmessage = async (msg: PluginMessage) => {
  if (msg.type === "debug") {
    return;
  }
  // Handle puzzle creation with individual pieces
  if (msg.type === "create-puzzle") {
    const rows = msg.rows;
    const columns = msg.columns;
    const puzzleData = msg.puzzleData;
    const originalImageWidth = msg.originalImageWidth;
    const originalImageHeight = msg.originalImageHeight;

    const nodes: VectorNode[][] = [];
    // Calculate proper piece dimensions based on the original image
    const pieceWidth = originalImageWidth / columns;
    const pieceHeight = originalImageHeight / rows;

    // Create image hashes for each piece
    const imageHash: string = figma.createImage(new Uint8Array(msg.imageData)).hash;

    const D = Math.min(pieceWidth, pieceHeight) / 4;

    // Create shapes in a grid with no spacing (completed puzzle)
    for (let row = 0; row < rows; row++) {
      nodes[row] = [];
      for (let col = 0; col < columns; col++) {
        const vector = figma.createVector();

        // Position pieces directly adjacent to each other
        vector.x = col * pieceWidth;
        vector.y = row * pieceHeight;
        vector.strokeWeight = 0;

        // Apply the specific puzzle piece image (already cropped)
        // const imageHash = imageHashes[row][col];
        if (imageHash) {
          vector.fills = [
            {
              type: "IMAGE",
              imageHash: imageHash,
              scaleMode: "CROP",
              imageTransform: [[(pieceWidth+2*D)/originalImageWidth, 0, col/columns - D/originalImageWidth], [0, (pieceHeight+2*D)/originalImageHeight, row/rows - D/originalImageHeight]]
            },
          ];
        } else {
          // Fallback color with position indicator
          const hue = (row * columns + col) / (rows * columns);
          vector.fills = [
            {
              type: "SOLID",
              color: {
                r: 0.5 + 0.5 * Math.sin(hue * Math.PI * 2),
                g: 0.5 + 0.5 * Math.sin((hue + 0.33) * Math.PI * 2),
                b: 0.5 + 0.5 * Math.sin((hue + 0.66) * Math.PI * 2),
              },
            },
          ];
        }

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
        const currentNode = nodes[row][col];
        const midW = pieceWidth / 2;
        const midH = pieceHeight / 2;
        let data = "M";

        // top edge
        data += ` 0 0 L ${-1 * D} ${-1 * D} L 0 0`;
        if (neighborsData[row][col]?.top) {
          const baseHeight = 0;
          const d = neighborsData[row][col].top!.isTab ? -1 * D : D;
          data += ` L ${midW} ${baseHeight + d}`;
        }
        // right edge
        data += ` L ${pieceWidth} 0`;
        if (neighborsData[row][col]?.right) {
          const baseWidth = pieceWidth;
          const d = neighborsData[row][col].right!.isTab ? D : -1 * D;
          data += ` L ${baseWidth + d} ${midH}`;
        }
        // bottom edge
        data += ` L ${pieceWidth} ${pieceHeight} L ${pieceWidth + D} ${
          pieceHeight + D
        } L ${pieceWidth} ${pieceHeight}`;
        if (neighborsData[row][col]?.bottom) {
          const baseHeight = pieceHeight;
          const d = neighborsData[row][col].bottom!.isTab ? D : -1 * D;
          data += ` L ${midW} ${baseHeight + d}`;
        }
        // left edge
        data += ` L 0 ${pieceHeight}`;
        if (neighborsData[row][col]?.left) {
          const baseWidth = 0;
          const d = neighborsData[row][col].left!.isTab ? -1 * D : D;
          data += ` L ${baseWidth + d} ${midH}`;
        }

        currentNode.vectorPaths = [
          {
            windingRule: "EVENODD",
            data,
          },
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

    figma.currentPage.selection = allNodes;
    figma.viewport.scrollAndZoomIntoView(allNodes);

    figma.notify(
      `Created ${rows}×${columns} completed puzzle (${originalImageWidth}×${originalImageHeight}px) with ${puzzleData.length} pieces!`
    );
  }

  // Make sure to close the plugin when you're done. Otherwise the plugin will
  // keep running, which shows the cancel button at the bottom of the screen.
  figma.closePlugin();
};
