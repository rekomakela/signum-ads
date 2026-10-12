<script lang="ts">
  import { base, resolve } from '$app/paths';
  import type { SignumWorkbenchCase } from '$lib/types';
  import { caseDisplayTitle } from '$lib/display';

  let {
    item,
    featured = false,
    headingLevel = 3,
  }: {
    item: SignumWorkbenchCase;
    featured?: boolean;
    headingLevel?: 2 | 3;
  } = $props();

  const sourceTitle = $derived(caseDisplayTitle(item.compatibility_case_id, item.title));
  const analyticalTitle = $derived(item.archive.analytical_title ?? sourceTitle);
  const context = $derived(
    [item.archive.brand, item.archive.year_label].filter(Boolean).join(', '),
  );
  // The visible title already names the ad; a duplicate alt would be read twice.
  const imageAlt = $derived(
    item.asset.alt.trim().toLowerCase() === analyticalTitle.trim().toLowerCase()
      ? ''
      : item.asset.alt,
  );
  const headingTag = $derived(headingLevel === 2 ? 'h2' : 'h3');
</script>

<a
  class="case-tile"
  class:case-tile--featured={featured}
  href={resolve('/cases/[caseId]', { caseId: item.case_id })}
>
  <figure>
    <div class="case-tile__media">
      {#if item.asset.src}
        <img src={`${base}${item.asset.src}`} alt={imageAlt} loading="lazy" />
      {:else}
        <div class="case-tile__placeholder">
          <img src={`${base}/brand/mark.svg`} alt="" />
          <span>No source image</span>
        </div>
      {/if}
      {#if item.status === 'pending'}
        <span class="case-tile__status case-tile__status--pending">Pending</span>
      {/if}
    </div>
    <figcaption>
      {#if context}<p class="case-tile__context">{context}</p>{/if}
      <svelte:element this={headingTag} class="case-tile__title">{analyticalTitle}</svelte:element>
    </figcaption>
  </figure>
</a>
