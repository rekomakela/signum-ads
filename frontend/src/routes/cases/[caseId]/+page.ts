import { error } from '@sveltejs/kit';
import { signumWorkbenchData } from '$lib/generated/signum-workbench-data';
import type { PageLoad } from './$types';

export const prerender = true;

export function entries() {
  return signumWorkbenchData.cases.map((entry) => ({ caseId: entry.case_id }));
}

export const load: PageLoad = ({ params }) => {
  const index = signumWorkbenchData.cases.findIndex((entry) => entry.case_id === params.caseId);
  if (index < 0) {
    throw error(404, `Unknown case: ${params.caseId}`);
  }

  const item = signumWorkbenchData.cases[index];
  if (!item) {
    throw error(404, `Unknown case: ${params.caseId}`);
  }

  const previous = index > 0 ? signumWorkbenchData.cases[index - 1] : null;
  const next = index < signumWorkbenchData.cases.length - 1 ? signumWorkbenchData.cases[index + 1] : null;

  return {
    caseData: item,
    previousCase: previous ? { case_id: previous.case_id, title: previous.title } : null,
    nextCase: next ? { case_id: next.case_id, title: next.title } : null,
  };
};
