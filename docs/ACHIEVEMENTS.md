# GolfIQ Achievement System

## Overview
Gamified achievement system with 5 tiers (Bronze, Silver, Gold, Platinum, Diamond) across 17 different achievement types to drive user engagement and retention.

---

## Achievement Philosophy

### Design Principles
1. **Freemium Gamification:** Bronze/Silver/Gold free, Platinum/Diamond premium-only
2. **Progressive Challenge:** Each tier requires significantly more effort
3. **Immediate Feedback:** Awards calculated on round save (with 5-min grace period)
4. **Permanent Recognition:** Once earned, never revoked
5. **Performance & Volume:** Mix of skill-based and participation-based achievements

### Calculation Policy
- ✅ **Calculate on INSERT:** Always calculate when round is saved
- ⚠️ **Calculate on UPDATE:** Only within 5 minutes of round creation
- ❌ **Calculate on DELETE:** Never recalculate on deletion
- 🔒 **Never Revoke:** Earned tiers are permanent, counts only increment

---

## Achievement Definitions

### 1. Hole-in-One 🎯
**Description:** Achieving a hole-in-one on any hole

| Tier | Threshold | Premium |
|------|-----------|---------|
| Bronze | 1 | ❌ |
| Silver | 2 | ❌ |
| Gold | 3 | ❌ |
| Platinum | 4 | ✅ |
| Diamond | 5 | ✅ |

**Requirements:** Hole-by-hole data, score = 1 on par 3+ hole

---

### 2. Albatross 🦅
**Description:** Scoring 3 under par on any hole

| Tier | Threshold | Premium |
|------|-----------|---------|
| Bronze | 1 | ❌ |
| Silver | 2 | ❌ |
| Gold | 3 | ❌ |
| Platinum | 4 | ✅ |
| Diamond | 5 | ✅ |

**Requirements:** Hole-by-hole data, score = par - 3

---

### 3. Eagle 🦅
**Description:** Scoring 2 under par on any hole

| Tier | Threshold | Premium |
|------|-----------|---------|
| Bronze | 1 | ❌ |
| Silver | 5 | ❌ |
| Gold | 10 | ❌ |
| Platinum | 15 | ✅ |
| Diamond | 25 | ✅ |

**Requirements:** Hole-by-hole data, score = par - 2

---

### 4. Perfect Round 💯
**Description:** Completing a round scoring par or better on every hole

| Tier | Threshold | Premium |
|------|-----------|---------|
| Bronze | 1 round | ❌ |
| Silver | 2 rounds | ❌ |
| Gold | 3 rounds | ❌ |
| Platinum | 5 rounds | ✅ |
| Diamond | 10 rounds | ✅ |

**Requirements:** Hole-by-hole data, all holes ≤ par

---

### 5. Clean Sheet ✨
**Description:** Completing a round with no penalties

| Tier | Threshold | Premium |
|------|-----------|---------|
| Bronze | 1 round | ❌ |
| Silver | 2 rounds | ❌ |
| Gold | 3 rounds | ❌ |
| Platinum | 5 rounds | ✅ |
| Diamond | 10 rounds | ✅ |

**Requirements:** penalties = 0

---

### 6. Putt Master ⛳
**Description:** Completing a round with no 3-putts

| Tier | Threshold | Premium |
|------|-----------|---------|
| Bronze | 1 round | ❌ |
| Silver | 2 rounds | ❌ |
| Gold | 3 rounds | ❌ |
| Platinum | 5 rounds | ✅ |
| Diamond | 10 rounds | ✅ |

**Requirements:** Hole-by-hole data with putts tracked, all holes ≤ 2 putts

---

### 7. Fairway Finder 🎯
**Description:** Hitting 100% of fairways in a round

| Tier | Threshold | Premium |
|------|-----------|---------|
| Bronze | 1 round | ❌ |
| Silver | 2 rounds | ❌ |
| Gold | 3 rounds | ❌ |
| Platinum | 5 rounds | ✅ |
| Diamond | 10 rounds | ✅ |

**Requirements:** Advanced stats tracked, FIR = total FIR opportunities

---

### 8. Green Machine 🟢
**Description:** Hitting 100% of greens in regulation

| Tier | Threshold | Premium |
|------|-----------|---------|
| Bronze | 1 round | ❌ |
| Silver | 2 rounds | ❌ |
| Gold | 3 rounds | ❌ |
| Platinum | 5 rounds | ✅ |
| Diamond | 10 rounds | ✅ |

**Requirements:** Advanced stats tracked, GIR = total holes

---

### 9. Hot Streak 🔥
**Description:** Scoring under par on 3 consecutive holes in a round

| Tier | Threshold | Premium |
|------|-----------|---------|
| Bronze | 1 streak | ❌ |
| Silver | 2 streaks | ❌ |
| Gold | 3 streaks | ❌ |
| Platinum | 5 streaks | ✅ |
| Diamond | 10 streaks | ✅ |

**Requirements:** Hole-by-hole data, 3+ consecutive holes under par

---

### 10. Steady Eddie 📊
**Description:** Completing a round with no double bogeys or worse

| Tier | Threshold | Premium |
|------|-----------|---------|
| Bronze | 1 round | ❌ |
| Silver | 2 rounds | ❌ |
| Gold | 3 rounds | ❌ |
| Platinum | 5 rounds | ✅ |
| Diamond | 10 rounds | ✅ |

**Requirements:** Hole-by-hole data, all holes ≤ par + 1

---

### 11. Eagle Pair 🦅🦅
**Description:** Scoring back-to-back eagles in a round

| Tier | Threshold | Premium |
|------|-----------|---------|
| Bronze | 1 streak | ❌ |
| Silver | 2 streaks | ❌ |
| Gold | 3 streaks | ❌ |
| Platinum | 5 streaks | ✅ |
| Diamond | 10 streaks | ✅ |

**Requirements:** Hole-by-hole data, consecutive holes with score = par - 2

---

### 12. Rounds Played ⛳
**Description:** Total rounds logged in the app

| Tier | Threshold | Premium |
|------|-----------|---------|
| Bronze | 10 | ❌ |
| Silver | 25 | ❌ |
| Gold | 50 | ❌ |
| Platinum | 100 | ✅ |
| Diamond | 200 | ✅ |

**Requirements:** Round save (always increments by 1)

---

### 13. Course Explorer 🗺️
**Description:** Playing unique courses

| Tier | Threshold | Premium |
|------|-----------|---------|
| Bronze | 5 courses | ❌ |
| Silver | 10 courses | ❌ |
| Gold | 25 courses | ❌ |
| Platinum | 50 courses | ✅ |
| Diamond | 100 courses | ✅ |

**Requirements:** Check if courseId is new for user

---

### 14. Double Digits 💯
**Description:** Breaking 100

| Tier | Threshold | Premium |
|------|-----------|---------|
| Bronze | 1 | ❌ |
| Silver | 3 | ❌ |
| Gold | 5 | ❌ |
| Platinum | 10 | ✅ |
| Diamond | 25 | ✅ |

**Requirements:** score < 100

---

### 15. Under 90 🎯
**Description:** Breaking 90

| Tier | Threshold | Premium |
|------|-----------|---------|
| Bronze | 1 | ❌ |
| Silver | 3 | ❌ |
| Gold | 5 | ❌ |
| Platinum | 10 | ✅ |
| Diamond | 25 | ✅ |

**Requirements:** score < 90

---

### 16. Under 80 🏆
**Description:** Breaking 80

| Tier | Threshold | Premium |
|------|-----------|---------|
| Bronze | 1 | ❌ |
| Silver | 3 | ❌ |
| Gold | 5 | ❌ |
| Platinum | 10 | ✅ |
| Diamond | 25 | ✅ |

**Requirements:** score < 80

---

### 17. Scratch Territory 👑
**Description:** Breaking 70

| Tier | Threshold | Premium |
|------|-----------|---------|
| Bronze | 1 | ❌ |
| Silver | 2 | ❌ |
| Gold | 3 | ❌ |
| Platinum | 5 | ✅ |
| Diamond | 10 | ✅ |

**Requirements:** score < 70

---

### 18. Under Par ⭐
**Description:** Shooting under par

| Tier | Threshold | Premium |
|------|-----------|---------|
| Bronze | 1 | ❌ |
| Silver | 2 | ❌ |
| Gold | 3 | ❌ |
| Platinum | 5 | ✅ |
| Diamond | 10 | ✅ |

**Requirements:** score < par

---

## Database Schema

```prisma
enum AchievementType {
  HOLE_IN_ONE
  ALBATROSS
  EAGLE
  PERFECT_ROUND
  PENALTY_FREE_ROUND
  PUTT_MASTER
  FAIRWAY_MASTER
  GREEN_MASTER
  GOING_STREAKING
  NO_DOUBLES_ROUND
  BACK_TO_BACK_EAGLES
  ROUNDS_PLAYED
  COURSES_PLAYED
  BREAK_100
  BREAK_90
  BREAK_80
  BREAK_70
  UNDER_PAR
}

enum AchievementTier {
  BRONZE
  SILVER
  GOLD
  PLATINUM
  DIAMOND
}

// Master achievement definitions (seeded once)
model AchievementDefinition {
  id                BigInt          @id @default(autoincrement())
  type              AchievementType @unique
  name              String
  description       String
  icon              String?         // emoji
  bronzeThreshold   Int
  silverThreshold   Int
  goldThreshold     Int
  platinumThreshold Int
  diamondThreshold  Int

  userAchievements UserAchievement[]

  @@index([type])
}

// User's achievement progress
model UserAchievement {
  id               BigInt               @id @default(autoincrement())
  userId           BigInt
  achievementId    BigInt
  currentCount     Int                  @default(0)
  highestTier      AchievementTier?     // null if not earned any tier yet
  bronzeEarnedAt   DateTime?
  silverEarnedAt   DateTime?
  goldEarnedAt     DateTime?
  platinumEarnedAt DateTime?
  diamondEarnedAt  DateTime?
  lastUpdated      DateTime             @default(now()) @updatedAt

  user        User                  @relation(fields: [userId], references: [id], onDelete: Cascade)
  achievement AchievementDefinition @relation(fields: [achievementId], references: [id])

  @@unique([userId, achievementId])
  @@index([userId])
  @@index([highestTier])
}

// Achievement notifications/feed
model AchievementNotification {
  id            BigInt          @id @default(autoincrement())
  userId        BigInt
  achievementId BigInt
  tier          AchievementTier
  roundId       BigInt?         // which round triggered it
  isRead        Boolean         @default(false)
  createdAt     DateTime        @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, isRead])
  @@index([createdAt])
}
```

---

## Calculation Logic

### Achievement Calculator
```typescript
// lib/achievements/calculator.ts

export async function calculateAchievements(roundData: RoundData) {
  const achievements: { type: AchievementType; count: number }[] = [];

  // Hole-level achievements (require hole-by-hole data)
  if (roundData.holes && roundData.holes.length > 0) {
    // 1. Hole-in-One
    const hios = roundData.holes.filter(h => h.score === 1 && h.par >= 3).length;
    if (hios > 0) achievements.push({ type: 'HOLE_IN_ONE', count: hios });

    // 2. Albatross
    const albatrosses = roundData.holes.filter(h => h.score === h.par - 3).length;
    if (albatrosses > 0) achievements.push({ type: 'ALBATROSS', count: albatrosses });

    // 3. Eagle
    const eagles = roundData.holes.filter(h => h.score === h.par - 2).length;
    if (eagles > 0) achievements.push({ type: 'EAGLE', count: eagles });

    // 4. Perfect Round
    if (roundData.holes.every(h => h.score <= h.par)) {
      achievements.push({ type: 'PERFECT_ROUND', count: 1 });
    }

    // 5. Hot Streak (3 consecutive under par)
    const streaks = countConsecutiveUnderPar(roundData.holes, 3);
    if (streaks > 0) achievements.push({ type: 'GOING_STREAKING', count: streaks });

    // 6. No Doubles
    if (roundData.holes.every(h => h.score <= h.par + 1)) {
      achievements.push({ type: 'NO_DOUBLES_ROUND', count: 1 });
    }

    // 7. Back-to-Back Eagles
    const backToBackEagles = countBackToBackEagles(roundData.holes);
    if (backToBackEagles > 0) {
      achievements.push({ type: 'BACK_TO_BACK_EAGLES', count: backToBackEagles });
    }

    // 8. Putt Master
    if (roundData.advancedStatsTracked && roundData.holes.every(h => h.putts && h.putts <= 2)) {
      achievements.push({ type: 'PUTT_MASTER', count: 1 });
    }
  }

  // Round-level achievements
  // 9. Clean Sheet
  if (roundData.penalties === 0) {
    achievements.push({ type: 'PENALTY_FREE_ROUND', count: 1 });
  }

  // 10. Fairway Finder
  if (roundData.advancedStatsTracked && roundData.fir === roundData.totalFirOpportunities) {
    achievements.push({ type: 'FAIRWAY_MASTER', count: 1 });
  }

  // 11. Green Machine
  if (roundData.advancedStatsTracked && roundData.gir === roundData.totalGir) {
    achievements.push({ type: 'GREEN_MASTER', count: 1 });
  }

  // 12. Rounds Played
  achievements.push({ type: 'ROUNDS_PLAYED', count: 1 });

  // 13. Course Explorer
  const isNewCourse = await checkIfNewCourse(roundData.userId, roundData.courseId);
  if (isNewCourse) achievements.push({ type: 'COURSES_PLAYED', count: 1 });

  // 14-18. Score milestones
  if (roundData.score < 100) achievements.push({ type: 'BREAK_100', count: 1 });
  if (roundData.score < 90) achievements.push({ type: 'BREAK_90', count: 1 });
  if (roundData.score < 80) achievements.push({ type: 'BREAK_80', count: 1 });
  if (roundData.score < 70) achievements.push({ type: 'BREAK_70', count: 1 });
  if (roundData.score < roundData.par) achievements.push({ type: 'UNDER_PAR', count: 1 });

  return achievements;
}
```

### Achievement Updater (with 5-min Grace Period)
```typescript
// lib/achievements/updater.ts

export async function updateUserAchievements(
  userId: bigint,
  achievements: { type: AchievementType; count: number }[],
  roundId?: bigint
) {
  const definitions = await prisma.achievementDefinition.findMany();
  const subscription = await getUserSubscription(userId);
  const isPremium = subscription.tier === 'premium' || subscription.tier === 'lifetime';

  const notifications: AchievementNotification[] = [];

  for (const achievement of achievements) {
    const definition = definitions.find(d => d.type === achievement.type);
    if (!definition) continue;

    // Upsert user achievement record
    let userAchievement = await prisma.userAchievement.upsert({
      where: {
        userId_achievementId: { userId, achievementId: definition.id },
      },
      create: {
        userId,
        achievementId: definition.id,
        currentCount: achievement.count,
      },
      update: {
        currentCount: { increment: achievement.count },
      },
    });

    const newCount = userAchievement.currentCount + achievement.count;

    // Check tier thresholds
    const tiers = [
      { tier: 'BRONZE', threshold: definition.bronzeThreshold, field: 'bronzeEarnedAt', premium: false },
      { tier: 'SILVER', threshold: definition.silverThreshold, field: 'silverEarnedAt', premium: false },
      { tier: 'GOLD', threshold: definition.goldThreshold, field: 'goldEarnedAt', premium: false },
      { tier: 'PLATINUM', threshold: definition.platinumThreshold, field: 'platinumEarnedAt', premium: true },
      { tier: 'DIAMOND', threshold: definition.diamondThreshold, field: 'diamondEarnedAt', premium: true },
    ];

    for (const tierCheck of tiers) {
      // Skip premium tiers for free users
      if (tierCheck.premium && !isPremium) continue;

      // Check if newly earned
      if (newCount >= tierCheck.threshold && !userAchievement[tierCheck.field]) {
        await prisma.userAchievement.update({
          where: { id: userAchievement.id },
          data: {
            [tierCheck.field]: new Date(),
            highestTier: tierCheck.tier,
          },
        });

        // Create notification
        notifications.push({
          userId,
          achievementId: definition.id,
          tier: tierCheck.tier as AchievementTier,
          roundId,
        });
      }
    }
  }

  // Bulk create notifications
  if (notifications.length > 0) {
    await prisma.achievementNotification.createMany({ data: notifications });
  }

  return notifications;
}
```

---

## API Endpoints

```typescript
// GET /api/achievements
// Get all user achievements with progress

// GET /api/achievements/notifications
// Get unread achievement notifications

// PUT /api/achievements/notifications/read
// Mark notifications as read
// Body: { notificationIds: bigint[] }

// GET /api/achievements/definitions
// Get all achievement definitions (for display)
```

---

## UI Components

### Achievement Toast
Shows immediately when achievement is earned during round save

```tsx
<AchievementToast
  icon="🏆"
  name="Eagle"
  tier="GOLD"
  description="Scored 10 eagles"
  onClose={() => {}}
/>
```

### Achievements Page
Grid of all achievements with progress bars and tier indicators

### User Profile Badges
Display top 3-5 achievements on user profile

---

## Rare Achievement Confirmations

For exceptionally rare achievements, show confirmation dialog before saving:

```typescript
const RARE_ACHIEVEMENTS = [
  'HOLE_IN_ONE',
  'ALBATROSS',
  'PERFECT_ROUND',
  'BREAK_70',
  'UNDER_PAR',
];

// On round save, check for rare achievements
if (potentialAchievements.some(a => RARE_ACHIEVEMENTS.includes(a.type))) {
  const confirmed = confirm(
    '🎯 Congratulations! You\'re about to log an exceptional round. This will earn you a rare achievement. Please confirm this is correct.'
  );
  if (!confirmed) return;
}
```

---

## Achievement Preview

Show which achievements will be earned before saving round:

```tsx
{potentialAchievements.length > 0 && (
  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
    <p className="font-bold text-yellow-700">🏆 Achievements you'll earn:</p>
    <ul className="mt-2 space-y-1">
      {potentialAchievements.map(a => (
        <li key={a.type} className="text-sm text-yellow-600">
          • {a.name} ({a.tier})
        </li>
      ))}
    </ul>
  </div>
)}
```

---

## Future Enhancements

### V2 Features
- **Weekly challenges** (e.g., "Hit 70% FIR this week")
- **Seasonal achievements** (e.g., "Summer Shredder - 20 rounds in summer")
- **Friend challenges** (e.g., "Beat your friend's best score")
- **Course-specific achievements** (e.g., "Eagle on Pebble Beach #18")
- **Achievement leaderboard** (who has most achievements)

### V3 Features
- **Achievement rarity percentages** (e.g., "Only 2% of players have this")
- **Achievement sharing** (social media integration)
- **Achievement milestones** (e.g., "Unlock 50 achievements")
- **NFT badges** (blockchain-based unique achievements)

---

## Success Metrics

### Engagement
- **70%+ of users** earn at least 3 achievements in first month
- **40%+ of free users** unlock all free tier achievements (drives premium upgrade)
- **Achievements viewed** within 24hr of earning: 85%+

### Monetization
- **15%+ of premium conversions** cite achievements as a factor
- **Platinum/Diamond achievements** drive 5%+ of upgrades

### Retention
- **Users with 5+ achievements** have 2x retention vs those with <5
