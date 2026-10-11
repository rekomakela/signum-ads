<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { base, resolve } from '$app/paths';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  const isActive = (href: string): boolean =>
    href === '/'
      ? page.url.pathname === '/'
      : page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
</script>

<svelte:head>
  <title>Signum</title>
  <meta
    name="description"
    content="Explore Signum’s archive of decoded advertisements, recurring concepts, and evidence-led critical readings."
  />
  <link rel="icon" href={`${base}/brand/mark.svg`} />
</svelte:head>

<div class="app-shell">
  <aside class="app-sidebar">
    <a href={resolve('/')} class="app-brand" aria-label="Signum home">
      <img src={`${base}/brand/logo-reversed.svg`} alt="Signum" />
    </a>

    <nav class="app-nav" aria-label="Primary navigation">
      <a
        href={resolve('/cases')}
        class:active={isActive('/cases')}
        aria-current={isActive('/cases') ? 'page' : undefined}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="2"></rect>
          <path d="M9.5 4v16M9.5 9.5H20M9.5 14.5H20"></path>
        </svg>
        <span>Analyses</span>
      </a>
      <a
        href={resolve('/glossary')}
        class:active={isActive('/glossary')}
        aria-current={isActive('/glossary') ? 'page' : undefined}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 4.5h11.5A2.5 2.5 0 0 1 19 7v12.5H7.5A2.5 2.5 0 0 1 5 17z"></path>
          <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4"></path>
        </svg>
        <span>Concepts</span>
      </a>
      <a
        href={resolve('/method')}
        class:active={isActive('/method')}
        aria-current={isActive('/method') ? 'page' : undefined}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5"></circle>
          <path d="M12 10.5v5M12 7.5h.01"></path>
        </svg>
        <span>Method</span>
      </a>
      <hr class="app-nav__rule" />
      <a
        href={resolve('/analyse')}
        class:active={isActive('/analyse')}
        aria-current={isActive('/analyse') ? 'page' : undefined}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6.5h16M4 12h16M4 17.5h9"></path>
          <path d="M17.5 15v5M15 17.5h5"></path>
        </svg>
        <span>Analyse an ad</span>
      </a>
    </nav>
  </aside>

  <header class="app-mobile-header">
    <a href={resolve('/')} class="app-mobile-brand" aria-label="Signum home">
      <img class="app-mobile-brand__logo" src={`${base}/brand/logo.svg`} alt="Signum" />
      <img class="app-mobile-brand__mark" src={`${base}/brand/mark.svg`} alt="Signum" />
    </a>
    <nav aria-label="Primary navigation">
      <a
        href={resolve('/cases')}
        class:active={isActive('/cases')}
        aria-current={isActive('/cases') ? 'page' : undefined}>Analyses</a
      >
      <a
        href={resolve('/glossary')}
        class:active={isActive('/glossary')}
        aria-current={isActive('/glossary') ? 'page' : undefined}>Concepts</a
      >
      <a
        href={resolve('/method')}
        class:active={isActive('/method')}
        aria-current={isActive('/method') ? 'page' : undefined}>Method</a
      >
      <a
        href={resolve('/analyse')}
        class:active={isActive('/analyse')}
        aria-current={isActive('/analyse') ? 'page' : undefined}>Analyse</a
      >
    </nav>
  </header>

  <main class="app-main">
    {@render children()}
  </main>
</div>
