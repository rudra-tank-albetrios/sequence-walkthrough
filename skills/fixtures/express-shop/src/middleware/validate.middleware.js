const { ValidationError } = require('../errors');

function validate(schema) {
  return (req, res, next) => {
    const problem = schema.check(req.body);
    if (problem) {
      return next(new ValidationError(problem));
    }
    return next();
  };
}

module.exports = { validate };
