'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { captureClientEvent } from '@/lib/analytics/client';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

interface Screenshot {
  id: string;
  src: string;
  alt: string;
  title: string;
  description: string;
}

const SCREENSHOTS: Screenshot[] = [
  {
    id: 'dashboard-round-focus',
    src: '/screenshots/landing/dashboard-round-focus.png',
    alt: 'GolfIQ dashboard showing Round Focus, handicap, average score, best and worst scores, round count, and par scoring averages.',
    title: 'Your Game at a Glance',
    description: 'See your handicap, scoring summary, recent performance, and the clearest focus for your next round.',
  },
  {
    id: 'live-gps-hole-map',
    src: '/screenshots/landing/live-gps-hole-map.png',
    alt: 'GolfIQ live GPS view showing a satellite hole map, front, middle, and back green yardages, movable targets, and a recommended club.',
    title: 'Live GPS While You Play',
    description: 'Get live front, middle, and back yardages, movable targets, and My Bag club suggestions on supported courses.',
  },
  {
    id: 'live-round-hole-tracking',
    src: '/screenshots/landing/live-round-hole-tracking.png',
    alt: 'GolfIQ live round entry screen showing score controls, fairway and green direction tracking, chips, bunker shots, and other hole stats.',
    title: 'Fast Hole-by-Hole Tracking',
    description: 'Track your score and only the stats you care about as you move through a live 9 or 18 hole round.',
  },
  {
    id: 'round-insights',
    src: '/screenshots/landing/round-insights.png',
    alt: 'GolfIQ round detail screen showing Round Insights, scoring analysis, and strokes gained results after a completed round.',
    title: 'Understand What Shaped the Round',
    description: 'See what held up, where strokes were lost, and what to take into your next round.',
  },
  {
    id: 'game-trends',
    src: '/screenshots/landing/game-trends.png',
    alt: 'GolfIQ Game Trends screen showing recent scoring form, a short game strength, scoring stability, and an improving scoring direction.',
    title: 'See How Your Game Is Changing',
    description: 'Understand how your recent rounds compare with your usual game through form, strengths, opportunities, and stability.',
  },
  {
    id: 'scoring-profile',
    src: '/screenshots/landing/scoring-profile.png',
    alt: 'GolfIQ Scoring Profile showing birdie, par, bogey, double and triple-plus distribution along with FIR, GIR, putting, penalties, and short game stats.',
    title: 'Know Your Scoring Patterns',
    description: 'See your scoring distribution and the core performance stats that shape your overall game.',
  },
  {
    id: 'score-history',
    src: '/screenshots/landing/score-history.png',
    alt: 'GolfIQ score history chart showing scores improving over time with a list of recent rounds and course results below.',
    title: 'Follow Your Progress Over Time',
    description: 'Keep your round history together and see how your scoring changes across the season.',
  },
  {
    id: 'friends',
    src: '/screenshots/landing/friends.png',
    alt: 'GolfIQ Friends screen showing connected golfers and pending friend requests.',
    title: 'Connect with Your Golf Friends',
    description: 'Add golfers you know, manage friend requests, and keep your golf circle connected in GolfIQ.',
  },
  {
    id: 'leaderboard',
    src: '/screenshots/landing/leaderboard.png',
    alt: 'GolfIQ friends leaderboard showing golfer rankings by handicap, average score, and best score.',
    title: 'See Where You Rank',
    description: 'Compare handicap, average score, and best score across friend and global leaderboards.',
  },
];

const MIN_SWIPE_DISTANCE = 50;
type CarouselNavigationMethod = 'indicator' | 'next_button' | 'previous_button' | 'swipe';

export default function ScreenshotCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const carouselRef = useRef<HTMLDivElement>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finishTransitionLater = () => {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = setTimeout(() => setIsTransitioning(false), 300);
  };

  useEffect(() => () => {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (touchStart === null || touchEnd === null) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > MIN_SWIPE_DISTANCE;
    const isRightSwipe = distance < -MIN_SWIPE_DISTANCE;

    if (isLeftSwipe && currentIndex < SCREENSHOTS.length - 1) {
      handleNext('swipe');
    }
    if (isRightSwipe && currentIndex > 0) {
      handlePrevious('swipe');
    }
  };

  const trackNavigation = (toIndex: number, navigationMethod: CarouselNavigationMethod) => {
    const fromScreenshot = SCREENSHOTS[currentIndex];
    const toScreenshot = SCREENSHOTS[toIndex];

    captureClientEvent(
      ANALYTICS_EVENTS.landingCarouselNavigated,
      {
        navigation_method: navigationMethod,
        direction: toIndex > currentIndex ? 'next' : 'previous',
        from_slide_id: fromScreenshot.id,
        from_slide_title: fromScreenshot.title,
        from_slide_number: currentIndex + 1,
        to_slide_id: toScreenshot.id,
        to_slide_title: toScreenshot.title,
        to_slide_number: toIndex + 1,
        slide_count: SCREENSHOTS.length,
      },
      { pathname: '/' },
    );
  };

  const handlePrevious = (navigationMethod: CarouselNavigationMethod = 'previous_button') => {
    if (isTransitioning || currentIndex === 0) return;
    const nextIndex = currentIndex - 1;
    trackNavigation(nextIndex, navigationMethod);
    setIsTransitioning(true);
    setDirection('right');
    setPreviousIndex(currentIndex);
    setCurrentIndex(nextIndex);
    finishTransitionLater();
  };

  const handleNext = (navigationMethod: CarouselNavigationMethod = 'next_button') => {
    if (isTransitioning || currentIndex === SCREENSHOTS.length - 1) return;
    const nextIndex = currentIndex + 1;
    trackNavigation(nextIndex, navigationMethod);
    setIsTransitioning(true);
    setDirection('left');
    setPreviousIndex(currentIndex);
    setCurrentIndex(nextIndex);
    finishTransitionLater();
  };

  const goToSlide = (index: number) => {
    if (isTransitioning || index === currentIndex) return;
    trackNavigation(index, 'indicator');
    setIsTransitioning(true);
    setDirection(index > currentIndex ? 'left' : 'right');
    setPreviousIndex(currentIndex);
    setCurrentIndex(index);
    finishTransitionLater();
  };

  const currentScreenshot = SCREENSHOTS[currentIndex];

  return (
    <div className="screenshot-carousel" role="region" aria-roledescription="carousel" aria-label="GolfIQ product tour">
      <div className="phone-mockup-wrapper">
        <div
          ref={carouselRef}
          className="carousel-container"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {SCREENSHOTS.map((screenshot, index) => {
            const isCurrent = index === currentIndex;
            const isPrevious = index === previousIndex;
            const isVisible = isCurrent || (isTransitioning && isPrevious);
            let slideStateClass = 'is-offscreen-left';

            if (isCurrent) {
              slideStateClass = 'is-current';
            } else if (isPrevious && isTransitioning) {
              slideStateClass = direction === 'left' ? 'is-previous-left' : 'is-previous-right';
            } else {
              slideStateClass = index > currentIndex ? 'is-offscreen-right' : 'is-offscreen-left';
            }

            return (
              <div
                key={screenshot.id}
                className={`carousel-slide ${slideStateClass}${isVisible ? ' is-visible' : ''}${isTransitioning ? ' is-transitioning' : ''}`}
                role="group"
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${SCREENSHOTS.length}: ${screenshot.title}`}
                aria-hidden={!isVisible}
              >
                <Image
                  src={screenshot.src}
                  alt={screenshot.alt}
                  width={1206}
                  height={2622}
                  sizes="(max-width: 768px) 224px, 280px"
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
            onClick={() => handlePrevious()}
            aria-label="Previous screenshot"
            type="button"
          >
            <ChevronLeft/>
          </button>
        )}

        {currentIndex < SCREENSHOTS.length - 1 && (
          <button
            className="carousel-button carousel-button-next"
            onClick={() => handleNext()}
            aria-label="Next screenshot"
            type="button"
          >
            <ChevronRight/>
          </button>
        )}

        {/* iPhone Frame Overlay */}
        <div className="phone-frame-overlay">
          <Image
            src="/screenshots/landing/iphone.png"
            alt=""
            width={1200}
            height={800}
            sizes="(max-width: 768px) 320px, 400px"
            priority
            className="phone-frame-image"
          />
        </div>
      </div>

      <div className="carousel-caption" aria-live="polite">
        <p className="carousel-caption-title">{currentScreenshot.title}</p>
        <p className="carousel-caption-description">{currentScreenshot.description}</p>
      </div>

      {/* Dot Indicators - Below phone frame */}
      <div className="carousel-indicators">
        {SCREENSHOTS.map((screenshot, index) => (
          <button
            key={screenshot.id}
            onClick={() => goToSlide(index)}
            className={`carousel-dot ${index === currentIndex ? 'active' : ''}`}
            aria-label={`Show ${screenshot.title}`}
            aria-current={index === currentIndex ? 'true' : undefined}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}
