// Local single-process throughput benchmark (Phase 9 evidence).
// Boots the real runtime on 127.0.0.1, matches N pairs, exchanges messages,
// and reports match/message latency percentiles. No external services.
const express = require('express');
const http = require('node:http');

async function main() {
  const { attachRuntime, issueSession } = await import('../runtime.ts');
  const { securityMiddleware } = await import('../serverSecurity.ts');
  const pairs = Number(process.argv[2] || 25);
  const msgPerRoom = Number(process.argv[3] || 20);

  const app = express();
  app.use(securityMiddleware({ production: false, adminToken: 'bench', testRateScale: 100 }));
  app.use(express.json({ limit: '7mb' }));
  const server = http.createServer(app);
  const stopRuntime = attachRuntime(app, server, { adminToken: 'bench' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;

  const call = async (path, token, body) => {
    const started = process.hrtime.bigint();
    const res = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: base,
        ...(token ? { Cookie: 'cm_session=' + token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await res.json();
    return { ms: Number(process.hrtime.bigint() - started) / 1e6, status: res.status, data };
  };

  const pct = (arr, p) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  };

  // Setup sessions
  const sessions = [];
  for (let i = 0; i < pairs * 2; i++) sessions.push(issueSession('bench' + i + '@example.com'));

  // Match
  const matchLat = [];
  const rooms = [];
  const t0 = Date.now();
  for (let i = 0; i < sessions.length; i += 2) {
    const a = sessions[i];
    const b = sessions[i + 1];
    const r1 = await call('/api/match/join', a.token, {
      interests: ['bench-topic'],
      allowNormal: true,
    });
    matchLat.push(r1.ms);
    const r2 = await call('/api/match/join', b.token, {
      interests: ['bench-topic'],
      allowNormal: true,
    });
    matchLat.push(r2.ms);
    if (r2.data.status !== 'matched' || !r2.data.roomId)
      throw new Error('match failed: ' + JSON.stringify(r2.data));
    rooms.push({ roomId: r2.data.roomId, a, b });
  }
  const matchWallMs = Date.now() - t0;

  // Messages (alternate sides)
  const sendLat = [];
  const t1 = Date.now();
  for (const room of rooms) {
    for (let m = 0; m < msgPerRoom; m++) {
      const from = m % 2 === 0 ? room.a : room.b;
      const r = await call('/api/chat/send', from.token, {
        roomId: room.roomId,
        text: 'bench message ' + m + ' ' + 'x'.repeat(50),
        clientMessageId: 'bench-' + room.roomId + '-' + m,
      });
      if (r.status !== 200) throw new Error('send failed: ' + JSON.stringify(r.data));
      sendLat.push(r.ms);
    }
  }
  const sendWallMs = Date.now() - t1;

  // Poll fetch
  const pollLat = [];
  for (const room of rooms) {
    const r = await call(
      '/api/chat/messages?roomId=' + encodeURIComponent(room.roomId) + '&sinceRevision=0',
      room.a.token,
    );
    pollLat.push(r.ms);
    if (r.data.messages.length !== msgPerRoom) throw new Error('message count mismatch');
  }

  const totalMsgs = rooms.length * msgPerRoom;
  console.log(
    JSON.stringify(
      {
        pairs,
        rooms: rooms.length,
        messagesPerRoom: msgPerRoom,
        totalMessages: totalMsgs,
        matchWallMs,
        sendWallMs,
        throughputMsgPerSec: Math.round((totalMsgs / sendWallMs) * 1000),
        matchJoinMs: { p50: pct(matchLat, 50).toFixed(2), p95: pct(matchLat, 95).toFixed(2) },
        sendMs: { p50: pct(sendLat, 50).toFixed(2), p95: pct(sendLat, 95).toFixed(2) },
        pollMs: { p50: pct(pollLat, 50).toFixed(2), p95: pct(pollLat, 95).toFixed(2) },
      },
      null,
      2,
    ),
  );

  stopRuntime();
  server.closeAllConnections();
  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
