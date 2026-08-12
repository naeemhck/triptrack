const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const NDK_VERSION = '27.1.12297006';
const DEST_DIR = path.join('C:\\Users\\Naeem\\Android\\Sdk\\ndk', NDK_VERSION);
const ZIP_URL = 'https://dl.google.com/android/repository/android-ndk-r27b-windows.zip';
const ZIP_PATH = path.join(__dirname, 'ndk-r27b.zip');

console.log('=== TripTrack Direct NDK r27b Downloader & Setup ===');

async function main() {
  if (fs.existsSync(path.join(DEST_DIR, 'source.properties'))) {
    console.log(`NDK ${NDK_VERSION} already installed at ${DEST_DIR}`);
    return;
  }

  console.log(`Downloading NDK r27b from ${ZIP_URL}...`);
  const file = fs.createWriteStream(ZIP_PATH);

  await new Promise((resolve, reject) => {
    https.get(ZIP_URL, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download: status code ${res.statusCode}`));
        return;
      }
      let downloaded = 0;
      const total = parseInt(res.headers['content-length'] || '0', 10);
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total) {
          process.stdout.write(`Downloading: ${((downloaded / total) * 100).toFixed(1)}%\r`);
        }
      });
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          console.log('\nDownload complete.');
          resolve();
        });
      });
    }).on('error', (err) => {
      fs.unlink(ZIP_PATH, () => {});
      reject(err);
    });
  });

  console.log('Extracting NDK zip...');
  const extractTemp = path.join(__dirname, 'ndk_temp');
  if (fs.existsSync(extractTemp)) {
    fs.rmSync(extractTemp, { recursive: true, force: true });
  }
  fs.mkdirSync(extractTemp, { recursive: true });

  execSync(`powershell -Command "Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${extractTemp}' -Force"`, { stdio: 'inherit' });

  console.log('Moving extracted NDK to destination...');
  const innerFolder = path.join(extractTemp, 'android-ndk-r27b');
  if (fs.existsSync(DEST_DIR)) {
    fs.rmSync(DEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(DEST_DIR), { recursive: true });
  fs.renameSync(innerFolder, DEST_DIR);

  fs.rmSync(extractTemp, { recursive: true, force: true });
  if (fs.existsSync(ZIP_PATH)) {
    fs.unlinkSync(ZIP_PATH);
  }

  console.log(`Successfully installed NDK ${NDK_VERSION} at ${DEST_DIR}`);
}

main().catch((err) => {
  console.error('Error installing NDK:', err);
  process.exit(1);
});
