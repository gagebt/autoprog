const sharp = require('sharp');
const { createCanvas, loadImage } = require('canvas');

const loggingEnabled = 0;

async function processImage(inputBuffer) {
    try {
        if (loggingEnabled) console.log("Starting image processing...");

        // Load the image and get its dimensions
        const image = await sharp(inputBuffer);
        const metadata = await image.metadata();
        const { width, height } = metadata;
        if (loggingEnabled) console.log(`Image dimensions: ${width}x${height}`);

        // Create a canvas with the same dimensions as the image
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        if (loggingEnabled) console.log("Canvas created.");

        // Load the image onto the canvas
        const img = await loadImage(inputBuffer);
        ctx.drawImage(img, 0, 0, width, height);
        if (loggingEnabled) console.log("Image loaded onto canvas.");

        // Create a separate canvas for the grid and labels
        const overlayCanvas = createCanvas(width, height);
        const overlayCtx = overlayCanvas.getContext('2d');
        if (loggingEnabled) console.log("Overlay canvas created.");

        // Function to determine background color and text color based on image brightness
        function getColors(x, y) {
            try {
                if (x >= width || y >= height) {
                    return { backgroundColor: 'rgba(0, 0, 0, 1)', textColor: 'white' };
                }
                let totalBrightness = 0;
                let pixelCount = 0;
                let step = 5;
                for (let dx = -1 * step; dx <= 1 * step; dx += step) {
                    for (let dy = -1 * step; dy <= 1 * step; dy += step) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const imageData = ctx.getImageData(nx, ny, 1, 1).data;
                            const brightness = (imageData[0] * 333 + imageData[1] * 444 + imageData[2] * 222) / 1000;
                            totalBrightness += brightness;
                            pixelCount++;
                        }
                    }
                }
                const averageBrightness = totalBrightness / pixelCount;
                const backgroundColor = averageBrightness > 128 ? 'rgba(255, 255, 255, 1)' : 'rgba(0, 0, 0, 1)';
                const textColor = averageBrightness > 128 ? 'black' : 'white';
                return {
                    backgroundColor,
                    textColor
                };
            } catch (error) {
                console.error(`Error in getColors at (${x}, ${y}):`, error);
                throw error;
            }
        }

        // Draw grid and coordinates
        const gridSize = 100;
        overlayCtx.font = '18px Arial';

        for (let x = 0; x <= width; x += gridSize) {
            for (let y = 0; y <= height; y += gridSize) {
                try {
                    if (loggingEnabled) console.log(`Processing grid point (${x}, ${y})`);

                    // Draw coordinates
                    const text = `(${x};${y})`;
                    const textWidth = overlayCtx.measureText(text).width;
                    const textHeight = 20; // Approximate height of the text

                    const { backgroundColor, textColor } = getColors(x, y);

                    // Adjust vertical position of the text background
                    const textYOffset = 0;
                    overlayCtx.fillStyle = backgroundColor;
                    overlayCtx.fillRect(x - textWidth/2-2, y + textYOffset + 5, textWidth + 4, textHeight);

                    // Adjust text position
                    overlayCtx.fillStyle = textColor;
                    overlayCtx.fillText(text, x - textWidth/2-2, y + textYOffset + 14 + 5);

                    // Draw point
                    overlayCtx.beginPath();
                    overlayCtx.arc(x, y, 6, 0, 2 * Math.PI); // Increase point size
                    overlayCtx.fillStyle = 'red';
                    overlayCtx.fill();
                    overlayCtx.lineWidth = 3; // Increase border thickness
                    overlayCtx.strokeStyle = 'green';
                    overlayCtx.stroke();
                } catch (error) {
                    console.error(`Error processing grid point (${x}, ${y}):`, error);
                    throw error;
                }
            }
        }
        if (loggingEnabled) console.log("Grid and coordinates drawn.");

        // Convert overlay canvas to buffer
        const overlayBuffer = overlayCanvas.toBuffer('image/png');
        if (loggingEnabled) console.log("Overlay canvas converted to buffer.");

        // Overlay the canvas on the original image
        const result = await sharp(inputBuffer)
            .composite([{ input: overlayBuffer, blend: 'over' }])
            .toBuffer();
        if (loggingEnabled) console.log("Image processing completed successfully.");

        return result;
    } catch (error) {
        console.error("Error during image processing:", error);
        throw error; // Re-throw the error after logging it
    }
}

module.exports = { processImage };