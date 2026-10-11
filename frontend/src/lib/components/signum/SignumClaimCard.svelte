<script lang="ts">
  import { resolve } from '$app/paths';
  import type { SignumClaim, SignumClaimReference, SignumWorkbenchCase } from '$lib/types';
  import { displayClaimKind } from '$lib/deconstruction';

  const { claim, caseData } = $props<{
    claim: SignumClaim;
    caseData: SignumWorkbenchCase;
  }>();

  const concepts = $derived(
    claim.references.map((reference: SignumClaimReference) => reference.reference_value),
  );
  const lens = $derived(displayClaimKind(claim.kind));
</script>

<article class="reading-row">
  <p class="reading-row__text">{claim.text}</p>
  <footer class="reading-row__footer">
    <span class="reading-row__lens">{lens}</span>
    {#if concepts.length > 0}
      <span class="reading-row__concepts" aria-label="Concepts used in this interpretation">
        {#each concepts as concept (concept)}
          <a
            href={resolve(
              `/glossary?from=${encodeURIComponent(caseData.case_id)}&concept=${encodeURIComponent(concept)}`,
            )}
          >
            {concept.replaceAll('_', ' ')}
          </a>
        {/each}
      </span>
    {/if}
  </footer>
</article>
