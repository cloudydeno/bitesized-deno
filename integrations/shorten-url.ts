// Support URL shortening through da.gd
// Never fails, just returns the long URL instead

export async function shortenUrl(url: string, dagdBaseUrl = 'https://da.gd') {
  const fullUrl = new URL('/s?' + new URLSearchParams({url}).toString(), dagdBaseUrl);
  try {

    const resp = await fetch(fullUrl, {
      headers: {
        accept: 'text/plain',
      },
    });
    if (resp.status !== 200) {
      throw new Error(`${dagdBaseUrl} returned status code ${resp.status} ${resp.statusText}`);
    }

    const text = await resp.text();
    if (!text.includes('://')) {
      throw new Error(`${dagdBaseUrl} response seemed bad: ${JSON.stringify(text)}`);
    }

    return text.trim();

  } catch (err: unknown) {
    console.error('WARN: could not shorten URL', url, '-', (err as Error).message ?? err);
    return url;
  }
};
