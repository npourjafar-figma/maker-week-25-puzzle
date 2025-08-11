// This plugin will open a window to prompt the user to enter a number, and
// it will then create that many shapes and connectors on the screen.

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// This shows the HTML page in "ui.html".
figma.showUI(__html__);

// Calls to "parent.postMessage" from within the HTML page will trigger this
// callback. The callback will be passed the "pluginMessage" property of the
// posted message.
interface PuzzlePieceData {
  row: number;
  col: number;
  imageData: ArrayBuffer;
}

interface CreatePuzzleMessage {
  type: 'create-puzzle';
  rows: number;
  columns: number;
  puzzleData: PuzzlePieceData[];
}

interface CreateShapesMessage {
  type: 'create-shapes';
  rows: number;
  columns: number;
  imageData?: ArrayBuffer;
  imageName?: string;
}

type PluginMessage = CreatePuzzleMessage | CreateShapesMessage;

figma.ui.onmessage = async (msg: PluginMessage) => {
  // Handle puzzle creation with individual pieces
  if (msg.type === 'create-puzzle') {
    const rows = msg.rows;
    const columns = msg.columns;
    const puzzleData = msg.puzzleData;

    const nodes: SceneNode[][] = [];
    const pieceWidth = 200; // Standard piece width
    const pieceHeight = 200; // Standard piece height
    
    // Create image hashes for each piece
    const imageHashes: (string | null)[][] = [];
    
    for (let row = 0; row < rows; row++) {
      imageHashes[row] = [];
      for (let col = 0; col < columns; col++) {
        const pieceData = puzzleData.find((p: PuzzlePieceData) => p.row === row && p.col === col);
        if (pieceData) {
          try {
            const image = figma.createImage(new Uint8Array(pieceData.imageData));
            imageHashes[row][col] = image.hash;
          } catch (error) {
            console.error(`Error processing piece ${row},${col}:`, error);
            imageHashes[row][col] = null;
          }
        } else {
          imageHashes[row][col] = null;
        }
      }
    }
    
    // Create shapes in a grid with no spacing (completed puzzle)
    for (let row = 0; row < rows; row++) {
      nodes[row] = [];
      for (let col = 0; col < columns; col++) {
        const shape = figma.createShapeWithText();
        shape.shapeType = 'SQUARE';
        
        // Position pieces directly adjacent to each other
        shape.x = col * pieceWidth;
        shape.y = row * pieceHeight;
        shape.resize(pieceWidth, pieceHeight);
        
        // Apply the specific puzzle piece image
        const imageHash = imageHashes[row][col];
        if (imageHash) {
          shape.fills = [{ 
            type: 'IMAGE', 
            imageHash: imageHash,
            scaleMode: 'FILL'
          }];
        } else {
          // Fallback color with position indicator
          const hue = (row * columns + col) / (rows * columns);
          shape.fills = [{ 
            type: 'SOLID', 
            color: { 
              r: 0.5 + 0.5 * Math.sin(hue * Math.PI * 2),
              g: 0.5 + 0.5 * Math.sin((hue + 0.33) * Math.PI * 2), 
              b: 0.5 + 0.5 * Math.sin((hue + 0.66) * Math.PI * 2)
            } 
          }];
        }
        
        // Add text to show piece position (optional, can be removed for cleaner look)
        if ('characters' in shape) {
          shape.characters = `${row + 1},${col + 1}`;
        }
        
        figma.currentPage.appendChild(shape);
        nodes[row][col] = shape;
      }
    }

    // Select all shapes (no connectors)
    const allNodes: SceneNode[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        allNodes.push(nodes[row][col]);
      }
    }
    figma.currentPage.selection = allNodes;
    figma.viewport.scrollAndZoomIntoView(allNodes);
    
    figma.notify(`Created ${rows}×${columns} completed puzzle with ${puzzleData.length} pieces!`);
  }
  
  // Handle regular shape creation (legacy support)
  else if (msg.type === 'create-shapes') {
    const rows = msg.rows;
    const columns = msg.columns;

    let imageHash: string | null = null;
    
    // Process the image if provided
    if (msg.imageData && msg.imageName) {
      try {
        const image = figma.createImage(new Uint8Array(msg.imageData));
        imageHash = image.hash;
      } catch (error) {
        console.error('Error processing image:', error);
        figma.notify('Error processing image. Using default fill instead.');
      }
    }

    const nodes: SceneNode[][] = [];
    const spacing = 200;
    
    // Create shapes in a grid
    for (let row = 0; row < rows; row++) {
      nodes[row] = [];
      for (let col = 0; col < columns; col++) {
        const shape = figma.createShapeWithText();
        shape.shapeType = 'SQUARE';
        shape.x = col * (shape.width + spacing);
        shape.y = row * (shape.height + spacing);
        
        // Apply image fill if available, otherwise use default orange color
        if (imageHash) {
          shape.fills = [{ 
            type: 'IMAGE', 
            imageHash: imageHash,
            scaleMode: 'FILL'
          }];
        } else {
          shape.fills = [{ type: 'SOLID', color: { r: 1, g: 0.5, b: 0 } }];
        }
        
        figma.currentPage.appendChild(shape);
        nodes[row][col] = shape;
      }
    }

    // Create horizontal connectors (within each row)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns - 1; col++) {
        const connector = figma.createConnector();
        connector.strokeWeight = 8;

        connector.connectorStart = {
          endpointNodeId: nodes[row][col].id,
          magnet: 'AUTO',
        };

        connector.connectorEnd = {
          endpointNodeId: nodes[row][col + 1].id,
          magnet: 'AUTO',
        };
      }
    }

    // Create vertical connectors (between rows)
    for (let row = 0; row < rows - 1; row++) {
      for (let col = 0; col < columns; col++) {
        const connector = figma.createConnector();
        connector.strokeWeight = 8;

        connector.connectorStart = {
          endpointNodeId: nodes[row][col].id,
          magnet: 'AUTO',
        };

        connector.connectorEnd = {
          endpointNodeId: nodes[row + 1][col].id,
          magnet: 'AUTO',
        };
      }
    }

    // Select all shapes
    const allNodes: SceneNode[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        allNodes.push(nodes[row][col]);
      }
    }
    figma.currentPage.selection = allNodes;
    figma.viewport.scrollAndZoomIntoView(allNodes);
    
    // Notify user about successful creation
    if (imageHash) {
      figma.notify(`Created ${rows}x${columns} grid with custom image!`);
    } else {
      figma.notify(`Created ${rows}x${columns} grid with default styling!`);
    }
  }

  // Make sure to close the plugin when you're done. Otherwise the plugin will
  // keep running, which shows the cancel button at the bottom of the screen.
  figma.closePlugin();
};
