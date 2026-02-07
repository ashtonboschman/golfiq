'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Screenshot {
  src: string;
  alt: string;
}

export default function ScreenshotCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const carouselRef = useRef<HTMLDivElement>(null);

  const screenshots: Screenshot[] = [
    { src: '/screenshots/landing/dashboard_1.PNG', alt: 'GolfIQ Dashboard - Overview' },
    { src: '/screenshots/landing/dashboard_2.PNG', alt: 'GolfIQ Dashboard - Analytics' },
    { src: '/screenshots/landing/dashboard_3.PNG', alt: 'GolfIQ Dashboard - Insights' },
    { src: '/screenshots/landing/rounds.png', alt: 'GolfIQ Rounds' },
    { src: '/screenshots/landing/add_round_quick.png', alt: 'GolfIQ Add Round - Quick' },
    { src: '/screenshots/landing/add_round_hole_by_hole.png', alt: 'GolfIQ Add Round - Hole by Hole' },
    { src: '/screenshots/landing/round_stats.png', alt: 'GolfIQ Round Stats - Overview' },
    { src: '/screenshots/landing/courses.png', alt: 'GolfIQ Courses' },
    { src: '/screenshots/landing/course_details.png', alt: 'GolfIQ Course Details' },
    { src: '/screenshots/landing/friends.png', alt: 'GolfIQ Friends' },
    { src: '/screenshots/landing/leaderboard_global.png', alt: 'GolfIQ Leaderboard - Global' },
    { src: '/screenshots/landing/leaderboard_friends.png', alt: 'GolfIQ Leaderboard - Friends' },
    { src: '/screenshots/landing/themes.png', alt: 'GolfIQ Themes' },
  ];

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && currentIndex < screenshots.length - 1) {
      handleNext();
    }
    if (isRightSwipe && currentIndex > 0) {
      handlePrevious();
    }
  };

  const handlePrevious = () => {
    if (isTransitioning || currentIndex === 0) return;
    setIsTransitioning(true);
    setDirection('right');
    setPreviousIndex(currentIndex);
    setCurrentIndex((prev) => prev - 1);
    setTimeout(() => setIsTransitioning(false), 300);
  };

  const handleNext = () => {
    if (isTransitioning || currentIndex === screenshots.length - 1) return;
    setIsTransitioning(true);
    setDirection('left');
    setPreviousIndex(currentIndex);
    setCurrentIndex((prev) => prev + 1);
    setTimeout(() => setIsTransitioning(false), 300);
  };

  const goToSlide = (index: number) => {
    if (isTransitioning || index === currentIndex) return;
    setIsTransitioning(true);
    setDirection(index > currentIndex ? 'left' : 'right');
    setPreviousIndex(currentIndex);
    setCurrentIndex(index);
    setTimeout(() => setIsTransitioning(false), 300);
  };

  return (
    <div className="screenshot-carousel">
      <div className="phone-mockup-wrapper">
        <div
          ref={carouselRef}
          className="carousel-container"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {screenshots.map((screenshot, index) => {
            const isCurrent = index === currentIndex;
            const isPrevious = index === previousIndex;
            const isVisible = isCurrent || (isTransitioning && isPrevious);

            let transform = 'translateX(0)';
            let opacity = 0;

            if (isCurrent) {
              transform = 'translateX(0)';
              opacity = 1;
            } else if (isPrevious && isTransitioning) {
              transform = direction === 'left' ? 'translateX(-100%)' : 'translateX(100%)';
              opacity = 0;
            } else {
              transform = index > currentIndex ? 'translateX(100%)' : 'translateX(-100%)';
              opacity = 0;
            }

            return (
              <div
                key={index}
                className="carousel-slide"
                style={{
                  transform,
                  opacity,
                  visibility: isVisible ? 'visible' : 'hidden',
                  transition: isTransitioning
                    ? 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out'
                    : 'none',
                }}
              >
                <Image
                  src={screenshot.src}
                  alt={screenshot.alt}
                  width={1206}
                  height={2622}
                  priority={index === 0}
                  className="carousel-image"
                />
              </div>
            );
          })}
        </div>

        {/* Left / Right Buttons */}
        {currentIndex > 0 && (
          <button
            className="carousel-button carousel-button-prev"
            onClick={handlePrevious}
            aria-label="Previous screenshot"
          >
            <ChevronLeft/>
          </button>
        )}

        {currentIndex < screenshots.length - 1 && (
          <button
            className="carousel-button carousel-button-next"
            onClick={handleNext}
            aria-label="Next screenshot"
          >
            <ChevronRight/>
          </button>
        )}

        {/* iPhone Frame Overlay */}
        <div className="phone-frame-overlay">
          <Image
            src="/screenshots/landing/iphone.png"
            alt="iPhone Frame"
            width={1200}
            height={800}
            priority
            className="phone-frame-image"
          />
        </div>
      </div>

      {/* Dot Indicators - Below phone frame */}
      <div className="carousel-indicators">
        {screenshots.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`carousel-dot ${index === currentIndex ? 'active' : ''}`}
            aria-label={`Go to screenshot ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
