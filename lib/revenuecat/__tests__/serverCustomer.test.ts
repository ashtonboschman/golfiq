import { deleteRevenueCatCustomer } from '@/lib/revenuecat/serverCustomer';

const mockedFetch = jest.fn();

describe('deleteRevenueCatCustomer', () => {
  const originalApiKey = process.env.REVENUECAT_SECRET_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REVENUECAT_SECRET_API_KEY = 'secret_rc_key';
    global.fetch = mockedFetch;
  });

  afterAll(() => {
    if (originalApiKey === undefined) {
      delete process.env.REVENUECAT_SECRET_API_KEY;
    } else {
      process.env.REVENUECAT_SECRET_API_KEY = originalApiKey;
    }
  });

  it('deletes the encoded RevenueCat app user ID with the server secret', async () => {
    mockedFetch.mockResolvedValue({ ok: true, status: 200 });

    await deleteRevenueCatCustomer('user/42');

    expect(mockedFetch).toHaveBeenCalledWith(
      'https://api.revenuecat.com/v1/subscribers/user%2F42',
      expect.objectContaining({
        method: 'DELETE',
        cache: 'no-store',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret_rc_key',
        }),
      }),
    );
  });

  it('treats an already-missing RevenueCat customer as deleted', async () => {
    mockedFetch.mockResolvedValue({ ok: false, status: 404 });

    await expect(deleteRevenueCatCustomer('42')).resolves.toBeUndefined();
  });

  it('fails closed when the secret API key is missing', async () => {
    delete process.env.REVENUECAT_SECRET_API_KEY;

    await expect(deleteRevenueCatCustomer('42')).rejects.toThrow(
      'RevenueCat customer deletion is not configured.',
    );
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('does not silently ignore RevenueCat API failures', async () => {
    mockedFetch.mockResolvedValue({ ok: false, status: 503 });

    await expect(deleteRevenueCatCustomer('42')).rejects.toThrow(
      'RevenueCat customer deletion failed with status 503.',
    );
  });
});
