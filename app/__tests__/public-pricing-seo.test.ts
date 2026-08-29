import robots from '@/app/robots';
import sitemap from '@/app/sitemap';

describe('public pricing discovery', () => {
  it('includes pricing in the sitemap', () => {
    expect(sitemap()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        url: 'https://www.golfiq.ca/pricing',
        priority: 0.8,
      }),
    ]));
  });

  it('allows crawlers to index pricing', () => {
    const rules = robots().rules;
    const publicRule = Array.isArray(rules) ? rules[0] : rules;

    expect(publicRule.allow).toContain('/pricing');
    expect(publicRule.disallow).not.toContain('/pricing');
  });
});
