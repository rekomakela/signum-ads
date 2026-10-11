import { signumWorkbenchData } from '$lib/generated/signum-workbench-data';
import type { LayoutLoad } from './$types';

export const prerender = true;
export const trailingSlash = 'always';

export const load: LayoutLoad = () => {
  const cases = signumWorkbenchData.cases;
  const sourced = cases.filter((entry) => entry.source_url !== null).length;
  const counts = {
    total: cases.length,
    sourced,
    direct: cases.length - sourced,
    decoded: cases.filter((entry) => entry.status === 'decoded').length,
    pending: cases.filter((entry) => entry.status === 'pending').length,
  };

  return {
    dataset: signumWorkbenchData,
    counts,
  };
};
