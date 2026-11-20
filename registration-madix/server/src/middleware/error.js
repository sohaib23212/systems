export function notFound(req, res) {
  res.status(404).json({ error: 'not_found' });
}

export function errorHandler(err, req, res, _next) {
  const status = err.status ?? 500;
  if (status >= 500) {
    console.error('[error]', err);
  }
  res.status(status).json({
    error: err.code ?? 'internal_error',
    message: err.expose ? err.message : undefined,
  });
}

export function httpError(status, code, message) {
  const err = new Error(message ?? code);
  err.status = status;
  err.code = code;
  err.expose = true;
  return err;
}
