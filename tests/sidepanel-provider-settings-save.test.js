const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

test('sidepanel registers autosave listeners for CloudMail settings inputs', () => {
  assert.match(source, /function registerSettingsTextInputs\(/);
  assert.match(
    source,
    /registerSettingsTextInputs\(\[\s*inputCloudMailBaseUrl,\s*inputCloudMailAdminEmail,\s*inputCloudMailAdminPassword,\s*inputCloudMailReceiveMailbox,\s*inputCloudMailDomain,\s*\]\);/
  );
});

test('sidepanel registers autosave listeners for OutlookEmailPlus settings inputs', () => {
  assert.match(
    source,
    /registerSettingsTextInputs\(\[\s*inputOutlookEmailPlusBaseUrl,\s*inputOutlookEmailPlusApiKey,\s*inputOutlookEmailPlusCallerId,\s*inputOutlookEmailPlusProjectKey,\s*\]\);/
  );
  assert.match(
    source,
    /registerSettingsChangeAutoSave\(\[\s*selectOutlookEmailPlusPoolProvider\s*\]\);/
  );
});
