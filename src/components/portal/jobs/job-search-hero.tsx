'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { inputClass } from '@/components/portal/ui';

/**
 * The homepage search box.
 *
 * It performs NO searching itself: submitting navigates to /jobs with the query
 * in the URL, and the results are produced by the server-side search API. A
 * client-side filter over a hardcoded list would be exactly the fake search the
 * brief rules out.
 */
export function JobSearchHero(): React.ReactElement {
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    const params = new URLSearchParams();
    if (keyword.trim()) params.set('keyword', keyword.trim());
    if (location.trim()) params.set('location', location.trim());
    const query = params.toString();
    router.push(query ? `/jobs?${query}` : '/jobs');
  }

  return (
    <form
      onSubmit={submit}
      role="search"
      aria-label="Search jobs"
      className="rounded-xl border border-line bg-navy-surface p-4 shadow-sm"
    >
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
        <div>
          <label htmlFor="hero-keyword" className="sr-only">
            Job title, skill or keyword
          </label>
          <input
            id="hero-keyword"
            name="keyword"
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Job title, skill or keyword"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="hero-location" className="sr-only">
            Location
          </label>
          <input
            id="hero-location"
            name="location"
            type="text"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Location"
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-strong"
        >
          Search jobs
        </button>
      </div>
    </form>
  );
}
