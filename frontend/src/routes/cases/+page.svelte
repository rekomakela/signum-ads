<script lang="ts">
  import { onMount } from 'svelte';
  import { base, resolve } from '$app/paths';
  import SignumAdThumbnail from '$lib/components/signum/SignumAdThumbnail.svelte';
  import SignumFilterChip from '$lib/components/signum/SignumFilterChip.svelte';
  import SignumSearchInput from '$lib/components/signum/SignumSearchInput.svelte';
  import { buildGlossary, conceptIdsForCase } from '$lib/deconstruction';
  import { featuredRank, isFeaturedCase } from '$lib/featured';
  import type { PageData } from '../$types';

  let { data }: { data: PageData } = $props();
  let query = $state('');
  let statusFilter = $state<'all' | 'pending' | 'decoded'>('all');
  let sortMode = $state<'featured' | 'az' | 'evidence'>('featured');
  let conceptFilter = $state<string | null>(null);
  const glossary = $derived.by(() => buildGlossary(data.dataset.cases));
  const activeConcept = $derived(
    conceptFilter ? (glossary.find((entry) => entry.id === conceptFilter) ?? null) : null,
  );

  const statuses = ['all', 'decoded', 'pending'] as const;
  const statusCount = (status: (typeof statuses)[number]): number =>
    status === 'all'
      ? data.dataset.cases.length
      : data.dataset.cases.filter((entry) => entry.status === status).length;

  onMount(() => {
    conceptFilter = new URL(window.location.href).searchParams.get('concept');
  });

  const isFiltering = $derived(
    query.trim().length > 0 || statusFilter !== 'all' || conceptFilter !== null,
  );

  const filteredCases = $derived.by(() => {
    const search = query.trim().toLowerCase();
    const matches = data.dataset.cases.filter((entry) => {
      const searchable = [
        entry.case_id,
        entry.compatibility_case_id,
        entry.title,
        entry.summary ?? '',
        entry.evidence_types.join(' '),
        ...entry.observations.map((observation) => observation.description),
        ...entry.claims.map((claim) => claim.text),
        ...conceptIdsForCase(entry),
      ]
        .join(' ')
        .toLowerCase();
      const matchesSearch = search.length === 0 || searchable.includes(search);
      const matchesStatus = statusFilter === 'all' || entry.status === statusFilter;
      const matchesConcept = !conceptFilter || conceptIdsForCase(entry).includes(conceptFilter);
      return matchesSearch && matchesStatus && matchesConcept;
    });

    return matches.toSorted((a, b) => {
      if (sortMode === 'az') return a.title.localeCompare(b.title);
      if (sortMode === 'evidence') return b.observations.length - a.observations.length;
      const rankDelta =
        featuredRank(a.compatibility_case_id) - featuredRank(b.compatibility_case_id);
      if (Number.isFinite(rankDelta) && rankDelta !== 0) return rankDelta;
      if (isFeaturedCase(a.compatibility_case_id) !== isFeaturedCase(b.compatibility_case_id))
        return isFeaturedCase(a.compatibility_case_id) ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
  });
</script>

<svelte:head>
  <title>Analyses · Signum</title>
  <meta
    name="description"
    content="Browse analysed advertisements and inspect the visible details, interpretations, and supporting evidence behind each one."
  />
</svelte:head>

<section class="archive-page">
  <header class="archive-header">
    <h1>Analyses</h1>
    <p>
      {data.counts.total} advertisements, each read for what it shows, what it may mean, and why that
      reading fits.
    </p>
  </header>

  {#if activeConcept}
    <div class="archive-context">
      <div>
        <strong>Showing analyses that use {activeConcept.label}</strong>
        <p>{activeConcept.plain_language || activeConcept.definition}</p>
      </div>
      <a href={resolve('/cases')}>Show all analyses</a>
    </div>
  {/if}

  <div class="archive-toolbar">
    <SignumSearchInput bind:value={query} placeholder="Search title, visible details, or source…" />
    {#if data.counts.pending > 0}
      <div class="archive-toolbar__filters" aria-label="Filter by analysis status">
        {#each statuses as status (status)}
          <SignumFilterChip
            active={statusFilter === status}
            count={statusCount(status)}
            onclick={() => (statusFilter = status)}
          >
            {status === 'all' ? 'All' : status === 'decoded' ? 'Complete' : 'Pending'}
          </SignumFilterChip>
        {/each}
      </div>
    {/if}
    <label class="archive-sort">
      <span>Sort</span>
      <select bind:value={sortMode}>
        <option value="featured">Featured first</option>
        <option value="az">Title A–Z</option>
        <option value="evidence">Most visible details</option>
      </select>
    </label>
    <span class="archive-toolbar__result-count" aria-live="polite">
      {#if isFiltering}{filteredCases.length} of {data.counts.total}{/if}
    </span>
  </div>

  {#if filteredCases.length > 0}
    <div class="archive-grid">
      {#each filteredCases as item (item.case_id)}
        <SignumAdThumbnail
          {item}
          featured={isFeaturedCase(item.compatibility_case_id)}
          headingLevel={2}
        />
      {/each}
    </div>
  {:else}
    <section class="empty-state">
      <div class="empty-state__mark"><img src={`${base}/brand/mark.svg`} alt="" /></div>
      <h2>No analyses match</h2>
      <p>Try another search term or clear the current status filter.</p>
      <button
        type="button"
        onclick={() => {
          query = '';
          statusFilter = 'all';
          sortMode = 'featured';
        }}
      >
        Clear filters
      </button>
    </section>
  {/if}
</section>
