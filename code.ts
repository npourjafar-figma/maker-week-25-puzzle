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
figma.ui.onmessage = async (msg: {type: string, rows: number, columns: number, imageData?: ArrayBuffer, imageName?: string}) => {
  // One way of distinguishing between different types of messages sent from
  // your HTML page is to use an object with a "type" property like this.
  if (msg.type === 'create-shapes') {
    // This plugin creates shapes and connectors in a grid layout.
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
        // You can set shapeType to one of: 'SQUARE' | 'ELLIPSE' | 'ROUNDED_RECTANGLE' | 'DIAMOND' | 'TRIANGLE_UP' | 'TRIANGLE_DOWN' | 'PARALLELOGRAM_RIGHT' | 'PARALLELOGRAM_LEFT'
        shape.shapeType = 'ROUNDED_RECTANGLE';
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
