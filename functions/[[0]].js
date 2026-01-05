export async function onRequest(context) {
  const { request } = context;

  /* =========================
     0. WORKER CACHE (EARLY RETURN)
     ========================= */

  const cache = caches.default;
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  /* =========================
     1. PARSE URL (SAU CACHE)
     ========================= */

  const fullurl = new URL(request.url);
  const pathname = fullurl.pathname;
  const parts = pathname.split('/').filter(Boolean);

  if (parts.length < 3) {
    return new Response('URL không hợp lệ.', { status: 400 });
  }

  const part1 = parts[0]; // token (base64)
  const part2 = parts[1]; // owner/repo (base64)
  const part3 = parts.slice(2).join('/'); // file path (cho phép subfolder)

  if (part1.length <= 10 || part2.length <= 10) {
    return new Response(
      'Cả 2 phần của URL phải có độ dài lớn hơn 10 ký tự.',
      { status: 400 }
    );
  }

  let token, repoPath;
  try {
    token = atob(part1);
    repoPath = atob(part2);
  } catch {
    return new Response('Token hoặc repo không hợp lệ.', { status: 400 });
  }

  const originUrl =
    `https://raw.githubusercontent.com/${repoPath}/main/${part3}`;

  /* =========================
     2. FETCH ORIGIN (CACHE MISS)
     ========================= */

  let originResponse;
  try {
    originResponse = await fetch(originUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3.raw',
      }
    });
  } catch (err) {
    return new Response('Lỗi khi kết nối GitHub.', { status: 500 });
  }

  if (!originResponse.ok) {
    return new Response('Không thể lấy nội dung.', {
      status: originResponse.status
    });
  }

  /* =========================
     3. RESPONSE + STORE CACHE
     ========================= */

  const response = new Response(originResponse.body, originResponse);

  response.headers.set(
    'Cache-Control',
    'public, max-age=31536000, immutable'
  );
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('X-Content-Type-Options', 'nosniff');

  await cache.put(request, response.clone());

  return response;
}
