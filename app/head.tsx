export default function Head() {
  const logoUrl = 'https://golfiqa.ca/logos/wordmark/golfiq-wordmark-background.png'; // absolute URL to your wordmark PNG

  return (
    <>
      <title>GolfIQ</title>
      <meta name="description" content="GolfIQ App – Smart insights for Manitoba golfers." />

      {/* Open Graph */}
      <meta property="og:title" content="GolfIQ" />
      <meta property="og:description" content="GolfIQ App – Smart insights for Manitoba golfers." />
      <meta property="og:image" content={logoUrl} />
      <meta property="og:image:alt" content="GolfIQ Logo" />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://yourdomain.com" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="GolfIQ" />
      <meta name="twitter:description" content="GolfIQ App – Smart insights for Manitoba golfers." />
      <meta name="twitter:image" content={logoUrl} />

      <link rel="manifest" href="/manifest.json" />
      <link rel="icon" href="/favicon.ico" />
    </>
  );
}