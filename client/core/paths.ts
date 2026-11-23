import { stripBasePath } from '../../shared/base-path.ts';

/** URL prefix the bundle was built for (Vite `base`, from BASE_PATH); '' at the origin root. */
export const BASE_PATH = ((import.meta.env as ImportMetaEnv | undefined)?.BASE_URL ?? '/').replace(
  /\/+$/,
  '',
);
/** Root-relative app path (`/join`) to a URL path under the deployment base. */
export const appUrl = (path: string) => BASE_PATH + path;
/** Current location path relative to the deployment base, for routing. */
export const appRoute = (pathname = location.pathname) => stripBasePath(pathname, BASE_PATH);
