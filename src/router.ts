import { useSyncExternalStore } from 'react';

function subscribe(fn: () => void) {
  window.addEventListener('popstate', fn);
  window.addEventListener('hashchange', fn);
  return () => {
    window.removeEventListener('popstate', fn);
    window.removeEventListener('hashchange', fn);
  };
}

/** Current path + hash; re-renders on navigation. */
export function useLocation(): string {
  return useSyncExternalStore(subscribe, () => location.pathname + location.hash);
}

export function navigate(to: string) {
  history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
