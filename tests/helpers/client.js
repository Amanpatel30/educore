export const createClient = (baseUrl) => {
  const cookies = new Map();
  let defaultToken = null;

  const storeCookies = (res) => {
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1);

      // A cleared cookie arrives as an empty value.
      if (value === "") {
        cookies.delete(name);
      } else {
        cookies.set(name, value);
      }
    }
  };

  const request = async (
    method,
    path,
    { body, token, headers = {} } = {}
  ) => {
    const finalHeaders = { ...headers };
    // An explicit token overrides the client default; null forces no auth.
    const authToken = token === undefined ? defaultToken : token;

    if (body !== undefined) {
      finalHeaders["Content-Type"] = "application/json";
    }

    if (authToken) {
      finalHeaders.Authorization = `Bearer ${authToken}`;
    }

    if (cookies.size > 0) {
      finalHeaders.Cookie = [...cookies]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    storeCookies(res);

    const text = await res.text();

    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    return { status: res.status, body: parsed, headers: res.headers };
  };

  return {
    request,
    get: (path, options) => request("GET", path, options),
    post: (path, options) => request("POST", path, options),
    put: (path, options) => request("PUT", path, options),
    patch: (path, options) => request("PATCH", path, options),
    delete: (path, options) => request("DELETE", path, options),
    setToken: (value) => {
      defaultToken = value;
    },
    cookies,
  };
};
