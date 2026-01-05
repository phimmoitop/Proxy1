export async function onRequest(context) {
  const { request } = context;

  /* =========================
     0. WORKER CACHE (EARLY RETURN)
     ========================= */

  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  /* =========================
     1. PARSE URL
     ========================= */

  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);

  if (parts.length < 3) {
    return new Response('URL không hợp lệ.', { status: 400 });
  }

  const part1 = parts[0]; // token (base64)
  const part2 = parts[1]; // owner/repo (base64)
  const filePath = parts.slice(2).join('/');

  if (part1.length <= 10 || part2.length <= 10) {
    return new Response('URL không hợp lệ.', { status: 400 });
  }

  let token, repoPath;
  try {
    token = atob(part1);
    repoPath = atob(part2);
  } catch {
    return new Response('Token hoặc repo không hợp lệ.', { status: 400 });
  }

  const githubUrl =
    `https://raw.githubusercontent.com/${repoPath}/main/${filePath}`;

  /* =========================
     2. FETCH GITHUB (CACHE MISS)
     ========================= */

  const originResponse = await fetch(githubUrl, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3.raw',
    }
  });

  if (!originResponse.ok) {
    return new Response('Không thể lấy nội dung.', {
      status: originResponse.status
    });
  }

  /* =========================
     3. PASS-THROUGH RESPONSE
     ========================= */

  // GIỮ NGUYÊN body stream + headers
  const response = new Response(originResponse.body, originResponse);

  // ÉP cache bằng Worker cache (KHÔNG phải CDN)
  response.headers.set(
    'Cache-Control',
    'public, max-age=31536000, immutable'
  );
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('X-Content-Type-Options', 'nosniff');

  /* =========================
     4. STORE WORKER CACHE
     ========================= */

  await cache.put(request, response.clone());

  return response;
}
