/** @jest-environment jsdom */

import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import PricingLayout, { metadata } from '@/app/pricing/layout';

describe('/pricing metadata', () => {
  it('is canonical and indexable', () => {
    expect(metadata.alternates).toEqual({ canonical: '/pricing' });
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.title).toContain('GolfIQ Pricing');
  });

  it('publishes structured data for all public plans', () => {
    const { container } = render(
      <PricingLayout>
        <div>Pricing content</div>
      </PricingLayout>,
    );
    const script = container.querySelector('script[type="application/ld+json"]');
    const data = JSON.parse(script?.textContent || '{}');

    expect(data['@type']).toBe('SoftwareApplication');
    expect(data.url).toBe('https://www.golfiq.ca/pricing');
    expect(data.offers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'GolfIQ Free', price: '0', priceCurrency: 'CAD' }),
      expect.objectContaining({ name: 'GolfIQ Premium Monthly', price: '6.99', priceCurrency: 'CAD' }),
      expect.objectContaining({ name: 'GolfIQ Premium Annual', price: '49.99', priceCurrency: 'CAD' }),
    ]));
  });
});
