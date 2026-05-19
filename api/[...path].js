const UPSTREAM = "https://api.simcotools.com";

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
  response.setHeader("Cache-Control", "no-store");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "GET") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const path = Array.isArray(request.query.path)
    ? request.query.path.join("/")
    : request.query.path || "";
  const upstreamUrl = new URL(`/${path}`, UPSTREAM);

  Object.entries(request.query).forEach(([key, value]) => {
    if (key === "path") return;
    if (Array.isArray(value)) {
      value.forEach((item) => upstreamUrl.searchParams.append(key, item));
      return;
    }
    upstreamUrl.searchParams.set(key, value);
  });

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
      },
    });
    const body = await upstreamResponse.text();
    const contentType = upstreamResponse.headers.get("content-type") || "application/json";

    response.status(upstreamResponse.status);
    response.setHeader("Content-Type", contentType);
    response.send(body);
  } catch (error) {
    response.status(502).json({
      error: "Failed to reach SimCoTools API",
      detail: error.message,
    });
  }
}
