/* eslint-disable @typescript-eslint/no-require-imports, no-undef */

const fs = require('node:fs');
const path = require('node:path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const BACKUP_RULES = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <exclude domain="root" path="."/>
  <exclude domain="file" path="."/>
  <exclude domain="database" path="."/>
  <exclude domain="sharedpref" path="."/>
  <exclude domain="external" path="."/>
  <exclude domain="device_root" path="."/>
  <exclude domain="device_file" path="."/>
  <exclude domain="device_database" path="."/>
  <exclude domain="device_sharedpref" path="."/>
</full-backup-content>
`;

const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup disableIfNoEncryptionCapabilities="true">
    <exclude domain="root" path="."/>
    <exclude domain="file" path="."/>
    <exclude domain="database" path="."/>
    <exclude domain="sharedpref" path="."/>
    <exclude domain="external" path="."/>
    <exclude domain="device_root" path="."/>
    <exclude domain="device_file" path="."/>
    <exclude domain="device_database" path="."/>
    <exclude domain="device_sharedpref" path="."/>
  </cloud-backup>
  <device-transfer>
    <exclude domain="root" path="."/>
    <exclude domain="file" path="."/>
    <exclude domain="database" path="."/>
    <exclude domain="sharedpref" path="."/>
    <exclude domain="external" path="."/>
    <exclude domain="device_root" path="."/>
    <exclude domain="device_file" path="."/>
    <exclude domain="device_database" path="."/>
    <exclude domain="device_sharedpref" path="."/>
  </device-transfer>
</data-extraction-rules>
`;

function withSecureBackupManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.$['android:allowBackup'] = 'false';
    application.$['android:fullBackupContent'] = '@xml/backup_rules';
    application.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
    return mod;
  });
}

function withSecureBackupResources(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const resourceDirectory = path.join(
        mod.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      fs.mkdirSync(resourceDirectory, { recursive: true });
      fs.writeFileSync(path.join(resourceDirectory, 'backup_rules.xml'), BACKUP_RULES);
      fs.writeFileSync(
        path.join(resourceDirectory, 'data_extraction_rules.xml'),
        DATA_EXTRACTION_RULES,
      );
      return mod;
    },
  ]);
}

module.exports = function withSecureBackupRules(config) {
  return withSecureBackupResources(withSecureBackupManifest(config));
};
