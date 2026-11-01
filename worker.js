export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Serve static assets (index.html, etc.)
    let response = await env.ASSETS.fetch(request);
    if (response.status === 404) {
      // SPA fallback to index.html
      response = await env.ASSETS.fetch(
        new Request(new URL("/index.html", request.url), request)
      );
    }
    return response;
  },
};
