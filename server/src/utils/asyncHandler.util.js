/**
 * asyncHandler — eliminates boilerplate try/catch from every async route handler.
 * Wraps the handler and forwards any thrown error to Express's next() automatically.
 *
 * @param {Function} fn  The async route handler to wrap
 * @returns {Function}   A standard Express middleware function
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
