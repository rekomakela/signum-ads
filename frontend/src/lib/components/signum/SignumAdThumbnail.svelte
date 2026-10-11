<script lang="ts">
  import { base, resolve } from '$app/paths';
  import type { SignumWorkbenchCase } from '$lib/types';
  import { caseDisplayTitle } from '$lib/display';

  let {
    item,
    featured = false,
  }: {
    item: SignumWorkbenchCase;
    featured?: boolean;
  } = $props();

  const sourceTitle = $derived(caseDisplayTitle(item.compatibility_case_id, item.title));
  const analyticalTitle = $derived(item.archive.analytical_title ?? sourceTitle);
  const context = $derived(
    [item.archive.brand, item.archive.year_label].filter(Boolean).join(' · '),
  );
</script>

<a
  class="case-tile"
  class:case-tile--featured={featured}
  href={resolve('/cases/[caseId]', { caseId: item.case_id })}
  aria-label={`Open ${analyticalTitle}`}
>
  <figure>
    <div class="case-tile__media">
      {#if item.asset.src}
        <img src={`${base}${item.asset.src}`} alt={item.asset.alt} loading="lazy" />
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
      <h3>{analyticalTitle}</h3>
    </figcaption>
  </figure>
</a>
