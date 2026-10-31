const sessions = new Map();

// Looks the token up in the session store of this sample.
function verifyToken(token) {
  return sessions.get(token) || null;
}

module.exports = { verifyToken };
