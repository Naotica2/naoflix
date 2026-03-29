const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'android/app/src/main/res/playstore-icon.png');
const resDir = path.join(__dirname, 'android/app/src/main/res');

const sizes = {
  'drawable-mdpi': 24,
  'drawable-hdpi': 36,
  'drawable-xhdpi': 48,
  'drawable-xxhdpi': 72,
  'drawable-xxxhdpi': 96
};

async function generatePushIcons() {
  try {
    const image = await Jimp.read(srcPath);
    // Determine if image has transparency or is solid. We'll convert to grayscale,
    // then to white where it's not transparent.
    // If it's a solid block without transparency, it'll just be a solid white block.
    // Let's at least convert the whole thing to a white silhouette.
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
      const alpha = this.bitmap.data[idx + 3];
      // Make it solid white, preserving the original alpha (transparency).
      this.bitmap.data[idx + 0] = 255; // R
      this.bitmap.data[idx + 1] = 255; // G
      this.bitmap.data[idx + 2] = 255; // B
      // Leave A (idx + 3) as is, so the shape remains intact.
    });

    for (const [folder, size] of Object.entries(sizes)) {
      const folderPath = path.join(resDir, folder);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
      const destPath = path.join(folderPath, 'ic_stat_onesignal_default.png');
      const resized = image.clone().resize(size, size, Jimp.RESIZE_BICUBIC);
      await resized.writeAsync(destPath);
      console.log('Created ' + destPath);
    }
  } catch (err) {
    console.error('Error generating icons:', err);
  }
}

generatePushIcons();
