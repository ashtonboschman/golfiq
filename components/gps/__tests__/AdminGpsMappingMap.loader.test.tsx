/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminGpsMappingMap from '@/components/gps/AdminGpsMappingMap';
import { loadGoogleMaps } from '@/lib/gps/googleMapsLoader';
import type { GpsMappedHoleDraft } from '@/lib/gps/adminMappingTypes';

jest.mock('@/lib/gps/googleMapsLoader', () => ({
  loadGoogleMaps: jest.fn(),
}));

const mockedLoadGoogleMaps = loadGoogleMaps as jest.MockedFunction<typeof loadGoogleMaps>;

const hole: GpsMappedHoleDraft = {
  id: '1',
  mappedCourseId: '10',
  holeNumber: 1,
  teeLat: 49.9,
  teeLng: -97.1,
  target1Lat: null,
  target1Lng: null,
  target1Label: null,
  target2Lat: null,
  target2Lng: null,
  target2Label: null,
  greenFrontLat: 49.9018,
  greenFrontLng: -97.1018,
  greenCenterLat: 49.902,
  greenCenterLng: -97.102,
  greenBackLat: 49.9022,
  greenBackLng: -97.1022,
  mappingStatus: 'DRAFT',
  source: 'MANUAL_ADMIN_GOOGLE',
  verifiedAt: null,
};

function mapProps() {
  return {
    apiKey: 'test-key',
    hole,
    selectedField: 'tee' as const,
    courseBounds: null,
    showCourseBounds: false,
    fallbackCenter: { lat: 49.9, lng: -97.1 },
    derivedCameraRequest: 0,
    onFieldSelect: jest.fn(),
    onPointChange: jest.fn(),
  };
}

describe('AdminGpsMappingMap loader integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the shared loader and can start a fresh attempt after failure', async () => {
    mockedLoadGoogleMaps
      .mockRejectedValueOnce(new Error('Google Maps failed to load.'))
      .mockImplementationOnce(() => new Promise<void>(() => {}));

    render(<AdminGpsMappingMap {...mapProps()} />);

    expect(await screen.findByText('Google Maps failed to load.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Map' }));

    await waitFor(() => expect(mockedLoadGoogleMaps).toHaveBeenCalledTimes(2));
    expect(mockedLoadGoogleMaps).toHaveBeenNthCalledWith(1, 'test-key');
    expect(mockedLoadGoogleMaps).toHaveBeenNthCalledWith(2, 'test-key');
  });

  it('preserves the missing-key fallback without calling the loader', () => {
    render(<AdminGpsMappingMap {...mapProps()} apiKey={undefined} />);

    expect(screen.getByText(
      'Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to use Google satellite mapping.',
    )).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry Map' })).not.toBeInTheDocument();
    expect(mockedLoadGoogleMaps).not.toHaveBeenCalled();
  });
});
