/** @jest-environment jsdom */

import React, { act } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useSession } from 'next-auth/react';
import MyBagPage from '@/app/profile/my-bag/page';

const mockReplace = jest.fn();
const mockShowMessage = jest.fn();
const mockShowConfirm = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('@/app/providers', () => ({
  useMessage: () => ({
    showMessage: mockShowMessage,
    showConfirm: mockShowConfirm,
  }),
}));

jest.mock('react-select', () => ({
  __esModule: true,
  default: ({ options, value, onChange, inputId, isDisabled, placeholder }: any) => {
    const flattenedOptions = options.flatMap((option: any) => option.options ?? [option]);

    return (
      <select
        id={inputId}
        value={value?.value ?? ''}
        disabled={isDisabled}
        onChange={(event) => {
          const next = flattenedOptions.find((option: any) => option.value === event.target.value);
          onChange?.(next ?? null);
        }}
      >
        <option value="">{placeholder}</option>
        {flattenedOptions.map((option: any) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  },
}));

jest.mock('@/components/skeleton/Skeleton', () => ({
  SkeletonBlock: () => <div data-testid="skeleton-block" />,
}));

const mockedUseSession = useSession as jest.Mock;

const driverDefinition = {
  id: '10',
  key: 'DRIVER',
  name: 'Driver',
  shortLabel: 'DR',
  category: 'WOOD',
  catalogueOrder: 10,
  isActive: true,
};

const eightIronDefinition = {
  id: '20',
  key: 'IRON_8',
  name: '8 Iron',
  shortLabel: '8I',
  category: 'IRON',
  catalogueOrder: 290,
  isActive: true,
};

function userClub(
  id: string,
  carryYards: number,
  clubDefinition = driverDefinition,
) {
  return {
    id,
    clubDefinitionId: clubDefinition.id,
    carryYards,
    clubDefinition,
  };
}

function bagResponse({
  clubs = [],
  catalogue = [driverDefinition, eightIronDefinition],
  maxClubs = 13,
}: {
  clubs?: ReturnType<typeof userClub>[];
  catalogue?: Array<typeof driverDefinition | typeof eightIronDefinition>;
  maxClubs?: number;
} = {}) {
  return {
    clubs,
    catalogue,
    clubCount: clubs.length,
    maxClubs,
  };
}

function response(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe('/profile/my-bag page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '1' } },
    });
  });

  it('shows loading state, then renders clubs sorted by carry distance', async () => {
    let resolveFetch!: (value: Response) => void;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    global.fetch = jest.fn().mockReturnValue(pendingFetch) as typeof fetch;

    render(<MyBagPage />);

    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();

    await act(async () => {
      resolveFetch(response(bagResponse({
        clubs: [
          userClub('2', 170, eightIronDefinition),
          userClub('1', 280),
        ],
      })));
    });

    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual(['Driver', '8 Iron']);
  });

  it('shows a load error and recovers through Retry', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response({ message: 'Bag unavailable.' }, false))
      .mockResolvedValueOnce(response(bagResponse()));
    global.fetch = fetchMock as typeof fetch;

    render(<MyBagPage />);

    expect(await screen.findByText('Bag unavailable.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('No Clubs Yet')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('associates the Club label and adds a validated club', async () => {
    const addedClub = userClub('1', 280);
    let getCount = 0;
    const fetchMock = jest.fn((url: string, init?: RequestInit): Promise<Response> => {
      if (url === '/api/my-bag/clubs' && init?.method === 'POST') {
        return Promise.resolve(response({ club: addedClub, clubCount: 1, maxClubs: 13 }));
      }
      if (url === '/api/my-bag') {
        getCount += 1;
        return Promise.resolve(response(getCount === 1
          ? bagResponse()
          : bagResponse({ clubs: [addedClub] })));
      }
      throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<MyBagPage />);
    await screen.findByText('No Clubs Yet');
    fireEvent.click(screen.getByRole('button', { name: 'Add Club' }));

    const clubSelect = screen.getByLabelText('Club');
    const carryInput = screen.getByLabelText('Carry Distance');
    expect(clubSelect).toHaveAttribute('id', 'my-bag-club-definition');
    expect(carryInput).toHaveAttribute('min', '1');
    expect(carryInput).toHaveAttribute('max', '399');

    fireEvent.change(clubSelect, { target: { value: driverDefinition.id } });
    fireEvent.change(carryInput, { target: { value: '0' } });
    expect(carryInput).toHaveValue('1');
    fireEvent.change(carryInput, { target: { value: '999' } });
    expect(carryInput).toHaveValue('399');
    fireEvent.change(carryInput, { target: { value: '280' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Club' }));

    await screen.findByText('280 yd');
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      clubDefinitionId: driverDefinition.id,
      carryYards: 280,
    });
    expect(mockShowMessage).toHaveBeenCalledWith('Club added to My Bag.', 'success');
  });

  it('updates a carry distance and refreshes the sorted list', async () => {
    const originalClub = userClub('1', 280);
    const updatedClub = userClub('1', 275);
    let getCount = 0;
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (url === '/api/my-bag') {
        getCount += 1;
        return Promise.resolve(response(bagResponse({ clubs: [getCount === 1 ? originalClub : updatedClub] })));
      }
      if (url === '/api/my-bag/clubs/1' && init?.method === 'PATCH') {
        return Promise.resolve(response({ club: updatedClub, clubCount: 1, maxClubs: 13 }));
      }
      throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<MyBagPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Driver' }));
    fireEvent.change(screen.getByLabelText('Carry yards for Driver'), { target: { value: '275' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('275 yd')).toBeInTheDocument();
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({ carryYards: 275 });
    expect(mockShowMessage).toHaveBeenCalledWith('Club updated.', 'success');
  });

  it('removes a club after confirmation and refreshes the empty state', async () => {
    const club = userClub('1', 280);
    let getCount = 0;
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (url === '/api/my-bag') {
        getCount += 1;
        return Promise.resolve(response(bagResponse({ clubs: getCount === 1 ? [club] : [] })));
      }
      if (url === '/api/my-bag/clubs/1' && init?.method === 'DELETE') {
        return Promise.resolve(response({ message: 'Club removed.', clubCount: 0, maxClubs: 13 }));
      }
      throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<MyBagPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Driver' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Club' }));

    const confirmation = mockShowConfirm.mock.calls.at(-1)?.[0];
    expect(confirmation).toEqual(expect.objectContaining({
      title: 'Remove Driver?',
      confirmText: 'Remove Club',
    }));

    await act(async () => {
      await confirmation.onConfirm();
    });

    expect(await screen.findByText('No Clubs Yet')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/my-bag/clubs/1', { method: 'DELETE' });
    expect(mockShowMessage).toHaveBeenCalledWith('Club removed.', 'success');
  });

  it('hides Add Club and marks the count complete at the 13-club limit', async () => {
    const clubs = Array.from({ length: 13 }, (_, index) => {
      const definition = {
        ...eightIronDefinition,
        id: String(100 + index),
        key: `IRON_${index}`,
        name: `Club ${index + 1}`,
        catalogueOrder: 100 + index,
      };
      return userClub(String(200 + index), 300 - index, definition);
    });
    global.fetch = jest.fn().mockResolvedValue(response(bagResponse({
      clubs,
      catalogue: clubs.map((club) => club.clubDefinition),
    }))) as typeof fetch;

    render(<MyBagPage />);

    const count = await screen.findByText('13 of 13 clubs');
    expect(count).toHaveClass('is-complete');
    expect(screen.queryByRole('button', { name: 'Add Club' })).not.toBeInTheDocument();
  });
});
