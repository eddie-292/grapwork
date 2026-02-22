import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置
const config = {
  // 源文件 (优先使用 SVG，否则使用 PNG)
  svgSource: path.join(__dirname, '../src/assets/logo.svg'),
  pngSource: path.join(__dirname, '../物料/logo.png'),
  // 输出目录
  outputDir: path.join(__dirname, '../build/icons'),
  // 要生成的尺寸
  sizes: [16, 24, 32, 48, 64, 128, 256, 512, 1024],
  // 主图标尺寸
  mainIconSize: 512,
};

// 确保输出目录存在
function ensureOutputDir() {
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
    console.log(`Created output directory: ${config.outputDir}`);
  }
}

// 获取源文件
function getSourceFile() {
  if (fs.existsSync(config.svgSource)) {
    console.log('Using SVG source:', config.svgSource);
    return config.svgSource;
  }
  if (fs.existsSync(config.pngSource)) {
    console.log('Using PNG source:', config.pngSource);
    return config.pngSource;
  }
  throw new Error(`No source file found. Please provide either:\n  - ${config.svgSource}\n  - ${config.pngSource}`);
}

// 生成单个尺寸的图标
async function generateIcon(source, size, outputPath) {
  await sharp(source)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outputPath);
  console.log(`Generated: ${path.basename(outputPath)}`);
}

// 生成所有图标
async function generateAllIcons() {
  console.log('Starting icon generation...\n');

  ensureOutputDir();
  const source = getSourceFile();

  // 生成各尺寸 PNG
  for (const size of config.sizes) {
    const outputPath = path.join(config.outputDir, `${size}x${size}.png`);
    await generateIcon(source, size, outputPath);
  }

  // 生成主图标 icon.png
  const mainIconPath = path.join(config.outputDir, 'icon.png');
  await generateIcon(source, config.mainIconSize, mainIconPath);

  console.log('\nIcon generation complete!');
  console.log(`Output directory: ${config.outputDir}`);
  console.log('\nGenerated files:');
  console.log(`  - ${config.sizes.map(s => `${s}x${s}.png`).join('\n  - ')}`);
  console.log(`  - icon.png (${config.mainIconSize}x${config.mainIconSize})`);
  console.log('\nNote: electron-builder will automatically convert these to .ico (Windows) and .icns (macOS) during build.');
}

// 执行
generateAllIcons().catch((err) => {
  console.error('Error generating icons:', err.message);
  process.exit(1);
});
