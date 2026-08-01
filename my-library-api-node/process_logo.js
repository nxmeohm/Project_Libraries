const Jimp = require('jimp');
const path = require('path');

const srcPaths = [
    'c:/Users/Saksit Thonsungeoen/Project_Libraries/my-library-user-web/public/logo.png',
    'c:/Users/Saksit Thonsungeoen/Project_Libraries/my-library-admin-web/public/logo.png',
    'c:/Users/Saksit Thonsungeoen/Project_Libraries/my-library-mobile/assets/logo.png'
];

async function processLogo() {
    try {
        console.log("Loading image...");
        // Just read the first one since they are identical
        const image = await Jimp.read(srcPaths[0]);
        
        // Find background color from top-left pixel
        const bgColor = image.getPixelColor(0, 0);
        const { r, g, b } = Jimp.intToRGBA(bgColor);
        console.log(`Background color: rgb(${r}, ${g}, ${b})`);

        // Replace background color with transparent
        const distance = (r1, g1, b1, r2, g2, b2) => Math.sqrt(Math.pow(r1-r2, 2) + Math.pow(g1-g2, 2) + Math.pow(b1-b2, 2));
        
        image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
            const pr = this.bitmap.data[idx + 0];
            const pg = this.bitmap.data[idx + 1];
            const pb = this.bitmap.data[idx + 2];
            const pa = this.bitmap.data[idx + 3];
            
            // If pixel is close to background color, make it transparent
            if (distance(r, g, b, pr, pg, pb) < 50) { // Tolerance of 50
                this.bitmap.data[idx + 3] = 0; // Alpha = 0
            }
        });
        
        // Auto-crop to remove empty transparent space
        image.autocrop();

        // Save to all destinations
        for (const p of srcPaths) {
            await image.writeAsync(p);
            console.log("Saved to", p);
        }
        console.log("Done!");
    } catch (err) {
        console.error("Error processing image:", err);
    }
}

processLogo();
