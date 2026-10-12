<script lang="ts">
  import type { SignumClaim, SignumObservation, SignumWorkbenchCase } from '$lib/types';
  import { claimsForObservation, rankClaimsForReading } from '$lib/deconstruction';
  import SignumClaimCard from './SignumClaimCard.svelte';

  const { observation, caseData } = $props<{
    observation: SignumObservation;
    caseData: SignumWorkbenchCase;
  }>();

  const linkedClaims = $derived(rankClaimsForReading(claimsForObservation(caseData, observation)));
  const leadClaim = $derived(linkedClaims[0] ?? null);
  const additionalClaims = $derived(linkedClaims.slice(1));
  const leadConcepts = $derived.by(() => {
    if (!leadClaim) return [];
    return Array.from(new Set(leadClaim.references.map((reference) => reference.reference_value)))
      .slice(0, 3)
      .map((concept) => concept.replaceAll('_', ' '));
  });

  const summaryContent = (claim: SignumClaim | null): string => claim?.text ?? '';
</script>

{#snippet pairs()}
  <span class="observation-row__pair">
    <span class="argument-label">Observation</span>
    <span class="observation-row__text">{observation.description}</span>
  </span>
  {#if leadClaim}
    <span class="observation-row__pair observation-row__lead-reading">
      <span class="argument-label">Interpretation</span>
      <span>
        {summaryContent(leadClaim)}
        {#if leadConcepts.length > 0}
          <span class="observation-row__concepts">Concepts: {leadConcepts.join(', ')}</span>
        {/if}
      </span>
    </span>
  {/if}
{/snippet}

{#if additionalClaims.length > 0}
  <details class="observation-row" id={`observation-${observation.ref}`}>
    <summary class="observation-row__summary">
      {@render pairs()}
      <span class="observation-row__more">
        {additionalClaims.length}
        {additionalClaims.length === 1 ? 'further reading' : 'further readings'}
        <svg class="disclosure-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m8 10 4 4 4-4"></path>
        </svg>
      </span>
    </summary>

    <div class="observation-row__body">
      <p class="observation-row__body-intro">
        Other readings connected to the same visible detail.
      </p>
      <div class="observation-claims__list">
        {#each additionalClaims as claim (claim.ref)}
          <SignumClaimCard {claim} {caseData} />
        {/each}
      </div>
    </div>
  </details>
{:else}
  <article class="observation-row observation-row--static" id={`observation-${observation.ref}`}>
    <div class="observation-row__summary">
      {@render pairs()}
    </div>
  </article>
{/if}
