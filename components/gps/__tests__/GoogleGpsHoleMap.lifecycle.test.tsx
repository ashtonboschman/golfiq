/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import GoogleGpsHoleMap from '@/components/gps/GoogleGpsHoleMap';
import { loadGoogleMaps } from '@/lib/gps/googleMapsLoader';
import type { GpsHolePrototypeConfig } from '@/lib/gps/types';

jest.mock('@/lib/gps/googleMapsLoader', () => ({
  loadGoogleMaps: jest.fn(),
}));

const mockedLoadGoogleMaps = loadGoogleMaps as jest.MockedFunction<typeof loadGoogleMaps>;
const mockMapConstructor = jest.fn();
const mockPolylineConstructor = jest.fn();
const mockPolylineSetMap = jest.fn();
const mockPolylineSetOptions = jest.fn();
const mockPolylineSetPath = jest.fn();

const listener = () => ({ remove: jest.fn() });
const latLng = (point: { lat: number; lng: number }) => ({
  lat: () => point.lat,
  lng: () => point.lng,
});

function installGoogleMapsMock() {
  class MockMap {
    private center: ReturnType<typeof latLng>;
    private zoom: number;

    constructor(_element: HTMLElement, options: { center: { lat: number; lng: number }; zoom: number }) {
      mockMapConstructor();
      this.center = latLng(options.center);
      this.zoom = options.zoom;
    }

    addListener() { return listener(); }
    getCenter() { return this.center; }
    getHeading() { return 0; }
    getRenderingType() { return 'RASTER'; }
    getTilt() { return 0; }
    getZoom() { return this.zoom; }
    moveCamera(options: { center?: { lat: number; lng: number }; zoom?: number }) {
      if (options.center) this.center = latLng(options.center);
      if (options.zoom != null) this.zoom = options.zoom;
    }
    setCenter(point: { lat: number; lng: number }) { this.center = latLng(point); }
    setHeading() {}
    setTilt() {}
    setZoom(zoom: number) { this.zoom = zoom; }
  }

  class MockMarker {
    static MAX_ZINDEX = 1000000;
    private position: ReturnType<typeof latLng> | null = null;

    constructor(options?: { position?: { lat: number; lng: number } }) {
      if (options?.position) this.position = latLng(options.position);
    }

    addListener() { return listener(); }
    getPosition() { return this.position; }
    setDraggable() {}
    setIcon() {}
    setLabel() {}
    setMap() {}
    setPosition(point: { lat: number; lng: number }) { this.position = latLng(point); }
    setZIndex() {}
  }

  class MockPolyline {
    constructor(options: unknown) { mockPolylineConstructor(options); }
    setMap(map: unknown) { mockPolylineSetMap(map); }
    setOptions(options: unknown) { mockPolylineSetOptions(options); }
    setPath(path: unknown) { mockPolylineSetPath(path); }
  }

  Object.defineProperty(globalThis, 'google', {
    configurable: true,
    writable: true,
    value: {
      maps: {
        Map: MockMap,
        Marker: MockMarker,
        Point: class MockPoint {},
        Polyline: MockPolyline,
        RenderingType: { VECTOR: 'VECTOR' },
        Size: class MockSize {},
        SymbolPath: { CIRCLE: 'CIRCLE' },
      },
    },
  });
}

const config: GpsHolePrototypeConfig = {
  courseName: 'Test Course',
  holeNumber: 1,
  par: 4,
  scorecardYardage: 400,
  tee: { lat: 49.9, lng: -97.1 },
  greenFront: { lat: 49.9018, lng: -97.1018 },
  greenCenter: { lat: 49.902, lng: -97.102 },
  greenBack: { lat: 49.9022, lng: -97.1022 },
  defaultTarget: { lat: 49.901, lng: -97.101 },
  recommendedTargets: [],
  mapCenter: { lat: 49.901, lng: -97.101 },
  mapZoom: 17,
  mapBearing: 0,
  mapTilt: 0,
};

function mapProps(activeHoleIndex: string, nextConfig = config) {
  return {
    variant: 'live' as const,
    config: nextConfig,
    activeHoleIndex,
    routeTargets: [nextConfig.defaultTarget],
    targetPath: [nextConfig.defaultTarget, nextConfig.greenCenter],
    currentLocation: {
      status: 'idle' as const,
      position: null,
      accuracyMeters: null,
      message: null,
    },
    measurementOrigin: nextConfig.tee,
    greenDistances: { front: 200, middle: 210, back: 220 },
    apiKey: 'test-key',
    onTargetChange: jest.fn(),
    onTargetToGreenCenter: jest.fn(),
    editModeEnabled: false,
    selectedEditField: 'tee' as const,
    onEditFieldSelect: jest.fn(),
    onEditPointChange: jest.fn(),
    onCameraChange: jest.fn(),
    useDerivedCamera: false,
    autoFitRequest: 0,
  };
}

describe('GoogleGpsHoleMap lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadGoogleMaps.mockResolvedValue();
    installGoogleMapsMock();
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('constructs one Google map while hole props update on the mounted component', async () => {
    const { rerender } = render(<GoogleGpsHoleMap {...mapProps('draft-1')} />);

    await waitFor(() => expect(mockMapConstructor).toHaveBeenCalledTimes(1));
    expect(mockPolylineConstructor).toHaveBeenCalledTimes(1);

    const nextConfig = {
      ...config,
      holeNumber: 2,
      tee: { lat: 49.91, lng: -97.11 },
      defaultTarget: { lat: 49.911, lng: -97.111 },
      greenCenter: { lat: 49.912, lng: -97.112 },
      mapCenter: { lat: 49.911, lng: -97.111 },
    };

    rerender(
      <GoogleGpsHoleMap
        {...mapProps('draft-2', nextConfig)}
      />,
    );

    await waitFor(() => expect(mockPolylineSetPath).toHaveBeenLastCalledWith([
      nextConfig.tee,
      nextConfig.defaultTarget,
      nextConfig.greenCenter,
    ]));
    expect(mockMapConstructor).toHaveBeenCalledTimes(1);
    expect(mockPolylineConstructor).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Google satellite map for physical hole 2')).toBeInTheDocument();
  });

  it.each([
    ['par 3', [config.greenCenter]],
    ['par 4', [config.defaultTarget, config.greenCenter]],
    ['par 5', [
      config.defaultTarget,
      { lat: 49.9015, lng: -97.1015 },
      config.greenCenter,
    ]],
  ])('renders one consistently styled route line for %s geometry', async (_label, targetPath) => {
    render(
      <GoogleGpsHoleMap
        {...mapProps('draft-1')}
        targetPath={targetPath}
      />,
    );

    await waitFor(() => expect(mockPolylineSetPath).toHaveBeenLastCalledWith([
      config.tee,
      ...targetPath,
    ]));
    expect(mockPolylineConstructor).toHaveBeenCalledTimes(1);
    expect(mockPolylineConstructor).toHaveBeenCalledWith(expect.objectContaining({
      clickable: false,
      geodesic: true,
      strokeColor: '#f8fafc',
      strokeOpacity: 0.9,
      strokeWeight: 2,
      zIndex: 30,
    }));
    expect(mockPolylineSetOptions).toHaveBeenLastCalledWith(expect.objectContaining({
      strokeColor: '#f8fafc',
      strokeOpacity: 0.9,
      strokeWeight: 2,
      zIndex: 30,
    }));
  });

  it('normalizes invalid and adjacent duplicate points without leaving stale geometry', async () => {
    const { rerender } = render(
      <GoogleGpsHoleMap
        {...mapProps('draft-1')}
        targetPath={[
          config.tee,
          { lat: Number.NaN, lng: -97.101 },
          config.defaultTarget,
          config.defaultTarget,
          config.greenCenter,
          config.greenCenter,
        ]}
      />,
    );

    await waitFor(() => expect(mockPolylineSetPath).toHaveBeenLastCalledWith([
      config.tee,
      config.defaultTarget,
      config.greenCenter,
    ]));

    rerender(
      <GoogleGpsHoleMap
        {...mapProps('draft-2')}
        measurementOrigin={{ lat: Number.NaN, lng: -97.1 }}
      />,
    );

    await waitFor(() => expect(mockPolylineSetPath).toHaveBeenLastCalledWith([]));
    expect(mockPolylineConstructor).toHaveBeenCalledTimes(1);
  });

  it('shows the live fallback when the Google Maps script fails', async () => {
    mockedLoadGoogleMaps.mockRejectedValue(new Error('Google Maps failed to load.'));

    render(<GoogleGpsHoleMap {...mapProps('draft-1')} />);

    expect(await screen.findByText('GPS unavailable for this hole.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry Map' })).toBeInTheDocument();
    expect(mockMapConstructor).not.toHaveBeenCalled();
  });

  it('retries a failed live load and initializes one map without a page reload', async () => {
    mockedLoadGoogleMaps.mockRejectedValueOnce(new Error('Google Maps failed to load.'));
    const { rerender } = render(<GoogleGpsHoleMap {...mapProps('draft-1')} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Retry Map' }));

    await waitFor(() => expect(mockedLoadGoogleMaps).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockMapConstructor).toHaveBeenCalledTimes(1));

    rerender(<GoogleGpsHoleMap {...mapProps('draft-2')} />);
    expect(mockMapConstructor).toHaveBeenCalledTimes(1);
    expect(mockPolylineConstructor).toHaveBeenCalledTimes(1);
  });

  it('preserves the live fallback without loading Google Maps when the API key is missing', () => {
    render(<GoogleGpsHoleMap {...mapProps('draft-1')} apiKey={undefined} />);

    expect(screen.getByText('GPS unavailable for this hole.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry Map' })).not.toBeInTheDocument();
    expect(mockedLoadGoogleMaps).not.toHaveBeenCalled();
    expect(mockMapConstructor).not.toHaveBeenCalled();
  });
});
