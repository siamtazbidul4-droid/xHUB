type KeyFn = (req: any) => string;

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyGenerator?: KeyFn;
  skipSuccessfulRequests?: boolean;
}

export function rateLimiter(options: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetTime: number }>();

  return (req: any, res: any, next: any) => {
    const key = options.keyGenerator ? options.keyGenerator(req) : req.ip || 'anonymous';
    const now = Date.now();
    const record = hits.get(key);

    if (!record || now > record.resetTime) {
      hits.set(key, { count: 1, resetTime: now + options.windowMs });
      res.setHeader('X-RateLimit-Limit', String(options.max));
      res.setHeader('X-RateLimit-Remaining', String(options.max - 1));
      return next();
    }

    record.count += 1;
    const remaining = Math.max(0, options.max - record.count);

    res.setHeader('X-RateLimit-Limit', String(options.max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (record.count > options.max) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    next();
  };
}
