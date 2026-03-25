import { Jimp } from 'jimp';

async function resize() {
  try {
    const image = await Jimp.read('public/og-image.jpg');
    
    // Resize to width 500
    image.resize({ w: 500 }); 
    
    await image.write('public/og-image.jpg');
    console.log('Image resized successfully');
  } catch (error) {
    console.error('Error resizing image:', error);
    process.exit(1);
  }
}

resize();
