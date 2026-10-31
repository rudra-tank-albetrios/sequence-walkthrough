const { UnauthorizedError } = require('../errors');
const { verifyToken } = require('../utils/token');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const user = verifyToken(header.replace('Bearer ', ''));
  if (!user) {
    return next(new UnauthorizedError('Missing or invalid token'));
  }
  req.user = user;
  return next();
}

module.exports = { authenticate };
