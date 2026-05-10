const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('content/signup-page.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }
  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
  }

  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return source.slice(start, end);
}

test('fillSignupEmailAndContinue preserves claimed email casing in page input', async () => {
  const api = new Function(`
const logs = [];
const clicks = [];
const scheduled = [];
const snapshot = {
  state: 'email_entry',
  emailInput: { value: '' },
  continueButton: { textContent: 'Continue', disabled: false },
  url: 'https://auth.openai.com/create-account',
};
const window = { setTimeout(fn) { scheduled.push(fn); return scheduled.length; } };
const location = { href: snapshot.url };

async function waitForSignupEntryState() { return snapshot; }
function getSignupEntryDiagnostics() { return {}; }
function getSignupEmailContinueButton() { return snapshot.continueButton; }
function isActionEnabled(target) { return Boolean(target) && !target.disabled; }
function fillInput(target, value) { target.value = value; }
async function humanPause() {}
function throwIfStopped() {}
function isStopError() { return false; }
function simulateClick(target) { clicks.push(target.textContent); }
function log(message, level = 'info') { logs.push({ message, level }); }

${extractFunction('normalizeSignupEmailInputValue')}
${extractFunction('fillSignupEmailAndContinue')}

return {
  async run(email) {
    return fillSignupEmailAndContinue(email, 2);
  },
  snapshot() {
    return { logs, clicks, scheduledCount: scheduled.length, emailValue: snapshot.emailInput.value };
  },
};
`)();

  const result = await api.run(' LarryMcdonald4676@outlook.com ');
  const snapshot = api.snapshot();

  assert.equal(result.email, 'LarryMcdonald4676@outlook.com');
  assert.equal(snapshot.emailValue, 'LarryMcdonald4676@outlook.com');
  assert.equal(snapshot.scheduledCount, 1);
});

test('submitAddEmailAndContinue preserves claimed email casing in add-email input', async () => {
  const api = new Function(`
const logs = [];
const submits = [];
const pageSnapshot = {
  emailInput: { value: '' },
  submitButton: { textContent: 'Continue', disabled: false },
};
const location = { href: 'https://auth.openai.com/u/login/identifier' };
const SIGNUP_EMAIL_EXISTS_PATTERN = /email exists/i;

async function waitForAddEmailPageReady() { return pageSnapshot; }
function getLoginEmailInput() { return pageSnapshot.emailInput; }
function getLoginSubmitButton() { return pageSnapshot.submitButton; }
function isActionEnabled(target) { return Boolean(target) && !target.disabled; }
function fillInput(target, value) { target.value = value; }
async function humanPause() {}
async function sleep() {}
async function triggerLoginSubmitAction(button, input) { submits.push({ button: button.textContent, email: input.value }); }
async function waitForAddEmailSubmitOutcome() { return { verificationPage: true }; }
function createStep8EmailInUseError() { return new Error('email in use'); }
function log(message, level = 'info') { logs.push({ message, level }); }

${extractFunction('normalizeSignupEmailInputValue')}
${extractFunction('submitAddEmailAndContinue')}

return {
  async run(email) {
    return submitAddEmailAndContinue({ email });
  },
  snapshot() {
    return { logs, submits, emailValue: pageSnapshot.emailInput.value };
  },
};
`)();

  const result = await api.run(' LarryMcdonald4676@outlook.com ');
  const snapshot = api.snapshot();

  assert.equal(result.email, 'LarryMcdonald4676@outlook.com');
  assert.equal(snapshot.emailValue, 'LarryMcdonald4676@outlook.com');
  assert.deepEqual(snapshot.submits, [{ button: 'Continue', email: 'LarryMcdonald4676@outlook.com' }]);
});
