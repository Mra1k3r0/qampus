const CSRF_PATTERNS = [
  /name="_csrf"[^>]*value="([^"]+)"/,
  /value="([^"]+)"[^>]*name="_csrf"/,
];

async function getCsrf(agent, path = '/login') {
  const response = await agent.get(path);

  if (response.status !== 200) {
    throw new Error(`Could not load ${path} to read a CSRF token. Status: ${response.status}`);
  }

  for (const pattern of CSRF_PATTERNS) {
    const match = pattern.exec(response.text);
    if (match) {
      return match[1];
    }
  }

  throw new Error(`No _csrf input found in the form at ${path}.`);
}

module.exports = {
  getCsrf,
  CSRF_PATTERNS,
};
