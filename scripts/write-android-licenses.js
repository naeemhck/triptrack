const fs = require('fs');
const path = require('path');

const LICENSES_DIR = 'C:\\Users\\Naeem\\Android\\Sdk\\licenses';

if (!fs.existsSync(LICENSES_DIR)) {
  fs.mkdirSync(LICENSES_DIR, { recursive: true });
}

const licenses = {
  'android-sdk-license': [
    '24333f8a6371d6ea4d12325550f4092be9263386',
    '89338d0d9d41e192999120e3e0e62a540085319d',
    'd56f5187479451eabf01fb78af6dfcb131a6481e',
    'e67567530e07284f420b78c3080e7293a5250462',
    'f41493800845226143c06e12a4475890973a6429'
  ].join('\n') + '\n',
  'android-sdk-preview-license': '84831b94fe706e6157f863d37975454153033d76\n',
  'android-googletv-license': '601007b946f40b5161750f96f9a6575d6d0d500c\n',
  'android-sys-trace-license': 'd94887b201a9e25483d54911049e309f615430ab\n',
  'mips-android-sys-trace-license': 'e94474771c6d42a41f3b269e7847b370b7672260\n',
  'google_cheets_license': '33b6a2b64607f11b759f320ef9dff4ae5c47d97a\n',
  'intel-android-sys-trace-license': 'd55f98a3572015580014a2d52611e146988e4a0e\n',
  'glass-reefs-license': '11130a3b3239160811f800f55d32e982135a4969\n'
};

for (const [filename, content] of Object.entries(licenses)) {
  const filePath = path.join(LICENSES_DIR, filename);
  fs.writeFileSync(filePath, content);
  console.log(`Wrote license file: ${filePath}`);
}

console.log('Successfully created all Android SDK license files.');
