/**
 * true in a production build (`next build`: Vercel production and preview deployments). Next inlines NODE_ENV when
 * it builds, in the server code and in the browser bundle alike, so no environment variable set at runtime can turn
 * the prototype's simulation chrome (architecture bar, illustrative catalogue and its notice) back on in production.
 */
export const IS_PRODUCTION_BUILD = process.env.NODE_ENV === "production";
