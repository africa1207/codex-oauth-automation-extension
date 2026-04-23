(function attachBackgroundStep6SessionCapture(root, factory) {
  root.MultiPageBackgroundStep6SessionCapture = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep6SessionCaptureModule() {
  function createStep6SessionCaptureExecutor(deps = {}) {
    const {
      addLog,
      chrome,
      clearOpenAiSiteCookiesNow,
      completeStepFromBackground,
      ensureContentScriptReadyOnTab,
      getTabId,
      isTabAlive,
      reuseOrCreateTab,
      SIGNUP_ENTRY_URL,
      SIGNUP_PAGE_INJECT_FILES,
      sleepWithStop = async (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      waitForTabComplete,
      waitForTabUrlMatch,
    } = deps;

    function normalizeSessionResponse(result = {}) {
      const session = result?.session && typeof result.session === 'object' ? result.session : null;
      const user = session?.user && typeof session.user === 'object' ? session.user : null;
      const accessToken = typeof result?.accessToken === 'string' ? result.accessToken.trim() : '';
      const sessionToken = typeof result?.sessionToken === 'string' ? result.sessionToken.trim() : '';
      const expires = typeof session?.expires === 'string' ? session.expires.trim() : '';

      return {
        accessToken: accessToken || null,
        sessionToken: sessionToken || null,
        chatgptAuthProvider: typeof result?.authProvider === 'string' ? result.authProvider.trim() || null : null,
        chatgptAccount: result?.account && typeof result.account === 'object' ? result.account : null,
        chatgptSession: session,
        chatgptSessionRaw: result?.sessionRaw || '',
        chatgptSessionExpires: expires || null,
        chatgptUser: user,
        chatgptUserEmail: typeof user?.email === 'string' ? user.email.trim() || null : null,
        chatgptUserName: typeof user?.name === 'string' ? user.name.trim() || null : null,
      };
    }

    function buildSessionDiagnostics(result = {}) {
      const session = result?.session && typeof result.session === 'object' ? result.session : null;
      const accessToken = typeof result?.accessToken === 'string' ? result.accessToken.trim() : '';
      const sessionToken = typeof result?.sessionToken === 'string' ? result.sessionToken.trim() : '';
      const expires = typeof session?.expires === 'string' ? session.expires.trim() : '';
      const userEmail = typeof session?.user?.email === 'string' ? session.user.email.trim() : '';
      return [
        `authenticated=${Boolean(result?.authenticated)}`,
        `hasAccessToken=${Boolean(accessToken)}`,
        `hasSessionToken=${Boolean(sessionToken)}`,
        `hasExpires=${Boolean(expires)}`,
        `hasUserEmail=${Boolean(userEmail)}`,
      ].join(', ');
    }

    async function fetchSessionFromMainWorld(tabId) {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: async () => {
          const response = await fetch('/api/auth/session', {
            method: 'GET',
            credentials: 'include',
            headers: {
              Accept: 'application/json',
            },
          });

          if (!response.ok) {
            return {
              authenticated: false,
              error: `auth/session request failed: HTTP ${response.status}`,
            };
          }

          const rawText = await response.text();
          let session = null;
          try {
            session = rawText ? JSON.parse(rawText) : null;
          } catch (error) {
            return {
              authenticated: false,
              error: `auth/session returned non-JSON: ${error?.message || error}`,
            };
          }

          const accessToken = typeof session?.accessToken === 'string'
            ? session.accessToken.trim()
            : '';
          const sessionToken = typeof session?.sessionToken === 'string'
            ? session.sessionToken.trim()
            : '';
          const user = session?.user && typeof session.user === 'object'
            ? session.user
            : null;
          const authenticated = Boolean(
            (accessToken && accessToken.length > 0)
              || (sessionToken && sessionToken.length > 0)
              || (user && Object.keys(user).length > 0)
              || session?.expires
          );

          return {
            authenticated,
            accessToken: accessToken || null,
            sessionToken: sessionToken || null,
            authProvider: typeof session?.authProvider === 'string' ? session.authProvider.trim() || null : null,
            account: session?.account && typeof session.account === 'object' ? session.account : null,
            session,
            sessionRaw: rawText,
          };
        },
      });

      return result?.result || null;
    }

    async function ensureChatgptHomeTab() {
      let tabId = await getTabId('signup-page');
      const alive = tabId && await isTabAlive('signup-page');

      if (!alive) {
        tabId = await reuseOrCreateTab('signup-page', SIGNUP_ENTRY_URL, {
          inject: SIGNUP_PAGE_INJECT_FILES,
          injectSource: 'signup-page',
          reloadIfSameUrl: true,
        });
      }

      await waitForTabComplete(tabId, {
        timeoutMs: 20000,
        retryDelayMs: 300,
      });

      const matchedTab = await waitForTabUrlMatch(
        tabId,
        (url) => /^https:\/\/(?:chatgpt\.com|chat\.openai\.com)(?:[/?#]|$)/i.test(String(url || '')),
        {
          timeoutMs: 25000,
          retryDelayMs: 400,
        }
      );

      if (!matchedTab) {
        throw new Error('步骤 6：about-you 提交后未进入 ChatGPT 首页，无法采集 session。');
      }

      await addLog(`步骤 6：首页 URL 已匹配：${matchedTab?.url || 'unknown'}`, 'info');

      await ensureContentScriptReadyOnTab('signup-page', tabId, {
        inject: SIGNUP_PAGE_INJECT_FILES,
        injectSource: 'signup-page',
        timeoutMs: 30000,
        retryDelayMs: 700,
        logMessage: '步骤 6：ChatGPT 首页仍在加载，正在等待注入脚本就绪...',
      });

      return {
        tabId,
        matchedTab,
      };
    }

    async function pollChatgptSession(tabId) {
      const timeoutMs = 45000;
      const intervalMs = 1500;
      const startedAt = Date.now();
      let lastResult = null;

      while (Date.now() - startedAt < timeoutMs) {
        const result = await fetchSessionFromMainWorld(tabId);
        if (result?.error) {
          await addLog(`步骤 6：auth/session 请求异常，${result.error}`, 'warn');
        }

        lastResult = result || null;
        await addLog(`步骤 6：auth/session 轮询结果，${buildSessionDiagnostics(result || {})}`, 'info');
        if (result?.authenticated) {
          return result;
        }

        await sleepWithStop(intervalMs);
      }

      return lastResult;
    }

    async function executeStep6() {
      await addLog('步骤 6：正在等待 ChatGPT 首页加载并采集 session/token...');
      const { tabId, matchedTab } = await ensureChatgptHomeTab();

      const result = await pollChatgptSession(tabId);
      if (result?.error && !result?.authenticated) {
        throw new Error(`步骤 6：auth/session 请求失败。当前页：${matchedTab?.url || 'unknown'}；${result.error}`);
      }

      if (!result?.authenticated) {
        throw new Error(
          `步骤 6：已到达 ChatGPT 首页，但 auth/session 仍未返回有效登录态。当前页：${matchedTab?.url || 'unknown'}；${buildSessionDiagnostics(result || {})}`
        );
      }

      const normalized = normalizeSessionResponse(result);
      if (!normalized.chatgptSession) {
        throw new Error('步骤 6：auth/session 返回为空，无法保存会话信息。');
      }

      await addLog(
        normalized.accessToken
          ? '步骤 6：已成功获取 ChatGPT session 与 access token。'
          : '步骤 6：已成功获取 ChatGPT session，但返回结果中不包含 access token。',
        normalized.accessToken ? 'ok' : 'warn'
      );

      if (typeof clearOpenAiSiteCookiesNow === 'function') {
        await clearOpenAiSiteCookiesNow('步骤 6');
      }

      await completeStepFromBackground(6, normalized);
    }

    return { executeStep6 };
  }

  return { createStep6SessionCaptureExecutor };
});
