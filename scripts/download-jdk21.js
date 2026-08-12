const fs = require('fs');
const https = require('https');
const path = require('path');
const { execSync } = require('child_process');

const destDir = path.join(process.env.USERPROFILE || 'C:\\Users\\Naeem', '.jdks', 'jdk-21');
const zipPath = path.join(destDir, 'jdk21.zip');
const tmpDir = destDir + '_tmp';

if (fs.existsSync(path.join(destDir, 'bin', 'java.exe'))) {
  console.log('JDK 21 already installed at:', destDir);
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
const apiUrl = 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/adoptium';

function download(url) {
  https.get(url, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      console.log('Following redirect to:', res.headers.location);
      return download(res.headers.location);
    }
    if (res.statusCode !== 200) {
      console.error('Download failed with status:', res.statusCode);
      process.exit(1);
    }
    const file = fs.createWriteStream(zipPath);
    res.pipe(file);
    file.on('finish', () => {
      file.close(() => {
        console.log('Downloaded JDK 21 zip. Extracting...');
        try {
          execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tmpDir}' -Force"`, { stdio: 'inherit' });
          const subdirs = fs.readdirSync(tmpDir);
          const extractedRoot = path.join(tmpDir, subdirs[0]);
          execSync(`powershell -Command "Copy-Item -Path '${extractedRoot}\\*' -Destination '${destDir}' -Recurse -Force"`, { stdio: 'inherit' });
          fs.rmSync(tmpDir, { recursive: true, force: true });
          fs.rmSync(zipPath, { force: true });
          console.log('Successfully installed JDK 21 at:', destDir);
        } catch (err) {
          console.error('Error during extraction:', err);
        }
      });
    });
  });
}

download(apiUrl);
