/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import InfoTooltip from '@/components/InfoTooltip';

function rect(overrides: Partial<DOMRect> = {}) {
  return {
    x: overrides.left ?? 0,
    y: overrides.top ?? 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...overrides,
  } as DOMRect;
}

describe('InfoTooltip', () => {
  let originalInnerWidth: PropertyDescriptor | undefined;
  let originalInnerHeight: PropertyDescriptor | undefined;
  let getBoundingClientRectSpy: jest.SpyInstance;
  let requestAnimationFrameSpy: jest.SpyInstance;
  let cancelAnimationFrameSpy: jest.SpyInstance;

  beforeEach(() => {
    originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 640 });
    requestAnimationFrameSpy = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    cancelAnimationFrameSpy = jest
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => {});
    getBoundingClientRectSpy = jest
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function getBoundingClientRect(this: Element) {
        if (this.classList.contains('info-tooltip-container')) {
          return rect({ top: 120, bottom: 140, left: 286, right: 306, width: 20, height: 20 });
        }

        if (this.classList.contains('info-tooltip-content')) {
          return rect({ top: 70, bottom: 114, left: 0, right: 200, width: 200, height: 44 });
        }

        return rect();
      });
  });

  afterEach(() => {
    getBoundingClientRectSpy.mockRestore();
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    if (originalInnerWidth) {
      Object.defineProperty(window, 'innerWidth', originalInnerWidth);
    }
    if (originalInnerHeight) {
      Object.defineProperty(window, 'innerHeight', originalInnerHeight);
    }
  });

  it('anchors to the right edge when centered placement would overflow the viewport', async () => {
    const { container } = render(<InfoTooltip text="Right edge tooltip" />);
    const icon = container.querySelector('.info-tooltip-icon');
    if (!icon) throw new Error('Expected tooltip icon');

    fireEvent.click(icon);

    const tooltip = screen.getByText('Right edge tooltip');
    await waitFor(() => {
      expect(tooltip).toHaveClass('right');
      expect(tooltip).toHaveClass('ready');
      expect(tooltip).not.toHaveClass('measuring');
    });
  });
});
