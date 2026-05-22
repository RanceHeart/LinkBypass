// LinkBypass CDP Test Runner
// Uses Node.js built-in WebSocket (no deps)

const WS_URL = 'ws://localhost:9223/devtools/browser/2fa5cb47-164a-4485-acff-a49a8f657ec4';

async function main() {
  const ws = new WebSocket(WS_URL);
  await waitForOpen(ws);

  let msgId = 0;
  const pending = {};
  const consoleMsgs = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending[msg.id]) {
      pending[msg.id](msg);
      delete pending[msg.id];
    }
    if (msg.method === 'Console.messageAdded') {
      const text = msg.params.message.text;
      consoleMsgs.push(text);
      console.log('🟡', text);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map(a => a.value ?? a.description ?? '').join(' ');
      consoleMsgs.push(text);
      console.log('🔷', text);
    }
  };

  function send(method, params = {}, sessionId) {
    const id = ++msgId;
    ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise(r => { pending[id] = r; });
  }

  // 1. Get targets
  let r = await send('Target.getTargets');
  let tab = r.result.targetInfos.find(t => t.type === 'page' && t.url.includes('localhost:8080'));
  
  if (!tab) {
    console.log('No test page found. Navigating newtab...');
    const newTab = r.result.targetInfos.find(t => t.url === 'chrome://newtab/');
    if (!newTab) { console.log('No newtab either!'); process.exit(1); }
    
    r = await send('Target.attachToTarget', { targetId: newTab.targetId, flatten: true });
    const tmpSid = r.result.sessionId;
    await send('Page.navigate', { url: 'http://localhost:8080/test.html' }, tmpSid);
    console.log('Navigated. Waiting 3s...');
    await sleep(3000);
    
    // Re-get targets
    r = await send('Target.getTargets');
    tab = r.result.targetInfos.find(t => t.type === 'page' && t.url.includes('localhost:8080'));
    if (!tab) {
      console.log('Still no test page. Current pages:');
      r.result.targetInfos.filter(t => t.type === 'page').forEach(p => console.log(' ', p.url));
      process.exit(1);
    }
  }
  
  console.log('TAB:', tab.url);

  // 2. Attach
  r = await send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
  const sid = r.result.sessionId;
  console.log('SID:', sid);

  // 3. Enable console + runtime
  await send('Console.enable', {}, sid);
  await send('Runtime.enable', {}, sid);
  await sleep(500);

  // 4. Check page
  r = await send('Runtime.evaluate', { expression: 'document.title + " | " + location.href' }, sid);
  console.log('PAGE:', r.result?.result?.value);

  // 5. Check content script
  await sleep(200);
  console.log('Console messages collected:', consoleMsgs.length);
  const hasCS = consoleMsgs.some(m => m.includes('[LinkBypass]'));
  console.log('Content script loaded:', hasCS);
  if (!hasCS) {
    console.log('All console messages:');
    consoleMsgs.forEach(m => console.log('  -', m));
  }

  // 6. Click cross-domain link
  console.log('\n--- Clicking link1 (https://example.com/) ---');
  r = await send('Runtime.evaluate', {
    expression: 'document.getElementById("link1").click(); "clicked"'
  }, sid);
  console.log('CLICK result:', r.result?.result?.value || JSON.stringify(r.error));

  // 7. Check if page navigated away
  await sleep(1500);
  r = await send('Runtime.evaluate', { expression: 'location.href' }, sid);
  const loc = r.result?.result?.value;
  console.log('\nLocation after click:', loc);
  
  if (loc === 'http://localhost:8080/test.html') {
    console.log('✅ INTERCEPTION WORKED! Page stayed on test page.');
  } else {
    console.log('❌ Interception FAILED. Page navigated to:', loc);
  }

  ws.close();
  process.exit(0);
}

function waitForOpen(ws) {
  return new Promise(r => { ws.onopen = r; });
}
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(e => { console.error(e); process.exit(1); });
