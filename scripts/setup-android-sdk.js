const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SDK_DIR = 'C:\\Users\\Naeem\\Android\\Sdk';
const sdkManager = path.join(SDK_DIR, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat');

console.log('=== TripTrack Android SDK NDK & License Installer ===');

const env = { 
  ...process.env, 
  JAVA_HOME: 'C:\\Users\\Naeem\\.jdks\\jdk-21', 
  ANDROID_HOME: SDK_DIR, 
  ANDROID_SDK_ROOT: SDK_DIR 
};

// Accept licenses by piping 'y' repeatedly
console.log('Accepting SDK licenses...');
const yesBuffer = Buffer.from(('y\n').repeat(100));
spawnSync(sdkManager, ['--sdk_root=' + SDK_DIR, '--licenses'], { input: yesBuffer, env, stdio: ['pipe', 'inherit', 'inherit'] });

console.log('Installing ndk;27.1.12297006, cmake;3.22.1, platforms;android-36, build-tools;36.0.0...');
spawnSync(sdkManager, ['--sdk_root=' + SDK_DIR, 'ndk;27.1.12297006', 'cmake;3.22.1', 'platforms;android-36', 'build-tools;36.0.0', 'platform-tools'], { input: yesBuffer, env, stdio: ['pipe', 'inherit', 'inherit'] });

console.log('Re-accepting licenses after installation...');
spawnSync(sdkManager, ['--sdk_root=' + SDK_DIR, '--licenses'], { input: yesBuffer, env, stdio: ['pipe', 'inherit', 'inherit'] });

console.log('Finished NDK and SDK setup.');
